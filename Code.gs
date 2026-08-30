/**
 * Sheeternetes — a container orchestrator whose control plane is a Google Sheet.
 *
 * This Apps Script IS the kube-apiserver + scheduler + controllers.
 * The Google Sheet IS etcd. kubelet.sh agents on real Docker hosts are the kubelets.
 *
 * Deploy: Extensions -> Apps Script, paste this file, then
 *   1) Run setup() once (creates headers, sample deployment, installs the timer trigger).
 *   2) Deploy -> New deployment -> Web app -> Execute as: Me, Access: Anyone.
 *   3) Copy the Web App URL into kubelet.sh (WEBAPP_URL) and skctl.
 *
 * Protocol (kubelet <-> apiserver), single sync call per heartbeat:
 *   POST body: { token, node, ip, cpu_total, mem_total, pods:[{name,phase,container_id}] }
 *   Response:  { pods:[{name,image,command,cpu_req,mem_req,desired:"Running"|"Terminating"}] }
 */

const TOKEN = 'CHANGE_ME_super_secret';   // must match kubelet.sh / skctl
const HEARTBEAT_TIMEOUT_MS = 90 * 1000;   // node considered NotReady after this

const TABS = {
  Deployments: ['name', 'image', 'replicas', 'cpu_req', 'mem_req', 'command'],
  Nodes:       ['name', 'ip', 'cpu_total', 'mem_total', 'cpu_used', 'mem_used', 'status', 'last_heartbeat'],
  Pods:        ['name', 'deployment', 'node', 'phase', 'container_id', 'image', 'cpu_req', 'mem_req', 'command', 'node_ip', 'started_at', 'message'],
  Events:      ['ts', 'kind', 'object', 'message'],
};

// ---------- generic sheet <-> objects ----------
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function readTab(name) {
  const sh = ss().getSheetByName(name);
  const rng = sh.getDataRange().getValues();
  const header = rng.shift();
  return rng
    .filter(r => String(r[0]).trim() !== '')
    .map(row => {
      const o = {};
      header.forEach((h, i) => { o[h] = row[i]; });
      return o;
    });
}

function writeTab(name, objects) {
  const sh = ss().getSheetByName(name);
  const header = TABS[name];
  const rows = objects.map(o => header.map(h => (o[h] === undefined || o[h] === null) ? '' : o[h]));
  // clear old body, write new
  const lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, header.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
}

function event(kind, object, message) {
  const sh = ss().getSheetByName('Events');
  sh.appendRow([new Date().toISOString(), kind, object, message]);
  // keep last ~200 events
  const n = sh.getLastRow();
  if (n > 220) sh.deleteRows(2, n - 200);
}

function shortId() { return Utilities.getUuid().replace(/-/g, '').substring(0, 5); }

// ---------- the control loop ----------
function reconcile() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const now = Date.now();
    const deployments = readTab('Deployments');
    let nodes = readTab('Nodes');
    let pods = readTab('Pods');

    // 1) node readiness from heartbeat
    nodes.forEach(n => {
      const hb = n.last_heartbeat ? Date.parse(n.last_heartbeat) : 0;
      const ready = hb && (now - hb) < HEARTBEAT_TIMEOUT_MS;
      const wasReady = n.status === 'Ready';
      n.status = ready ? 'Ready' : 'NotReady';
      if (wasReady && !ready) event('Node', n.name, 'NotReady (missed heartbeat)');
    });
    const readyNodes = nodes.filter(n => n.status === 'Ready');
    const readySet = {};
    readyNodes.forEach(n => { readySet[n.name] = n; });

    // 2) evict pods off dead nodes -> back to Pending for rescheduling
    pods.forEach(p => {
      if (p.node && !readySet[p.node] && p.phase !== 'Terminating') {
        event('Pod', p.name, 'evicted from ' + p.node + ' (node NotReady)');
        p.node = ''; p.node_ip = ''; p.container_id = ''; p.phase = 'Pending';
      }
    });

    // 3) drop terminated/failed rows the agents have confirmed gone
    pods = pods.filter(p => p.phase !== 'Deleted');

    // 4) reconcile replicas per deployment
    deployments.forEach(dep => {
      const want = Number(dep.replicas) || 0;
      let mine = pods.filter(p => p.deployment === dep.name && p.phase !== 'Terminating');
      // scale up
      while (mine.length < want) {
        const pod = {
          name: dep.name + '-' + shortId(),
          deployment: dep.name,
          node: '', phase: 'Pending', container_id: '',
          image: dep.image, cpu_req: dep.cpu_req, mem_req: dep.mem_req,
          command: dep.command, node_ip: '', started_at: '', message: '',
        };
        pods.push(pod); mine.push(pod);
        event('Pod', pod.name, 'created for deployment ' + dep.name);
      }
      // scale down (kill youngest first)
      if (mine.length > want) {
        const extra = mine.slice(want);
        extra.forEach(p => {
          if (p.phase !== 'Terminating') { p.phase = 'Terminating'; event('Pod', p.name, 'marked Terminating (scale down)'); }
        });
      }
    });

    // 5) drop pods whose deployment no longer exists
    const depNames = {};
    deployments.forEach(d => { depNames[d.name] = true; });
    pods.forEach(p => {
      if (!depNames[p.deployment] && p.phase !== 'Terminating') {
        p.phase = 'Terminating'; event('Pod', p.name, 'deployment removed -> Terminating');
      }
    });

    // 6) scheduler: place Pending pods on the Ready node with most free CPU
    const freeCpu = {};
    readyNodes.forEach(n => { freeCpu[n.name] = (Number(n.cpu_total) || 0); });
    // subtract already-placed pods
    pods.forEach(p => {
      if (p.node && freeCpu[p.node] !== undefined && p.phase !== 'Terminating') {
        freeCpu[p.node] -= (Number(p.cpu_req) || 0);
      }
    });
    pods.filter(p => p.phase === 'Pending').forEach(p => {
      let best = null, bestFree = -1;
      readyNodes.forEach(n => {
        const f = freeCpu[n.name] - (Number(p.cpu_req) || 0);
        if (f >= 0 && freeCpu[n.name] > bestFree) { best = n; bestFree = freeCpu[n.name]; }
      });
      if (best) {
        p.node = best.name; p.node_ip = best.ip; p.phase = 'Scheduled';
        freeCpu[best.name] -= (Number(p.cpu_req) || 0);
        event('Pod', p.name, 'scheduled on ' + best.name);
      } else {
        p.message = 'Unschedulable: no node with enough CPU';
      }
    });

    // 7) recompute node usage
    nodes.forEach(n => {
      let cpu = 0, mem = 0;
      pods.forEach(p => {
        if (p.node === n.name && p.phase !== 'Terminating') {
          cpu += Number(p.cpu_req) || 0; mem += Number(p.mem_req) || 0;
        }
      });
      n.cpu_used = cpu; n.mem_used = mem;
    });

    writeTab('Pods', pods);
    writeTab('Nodes', nodes);
    return { pods: pods, nodes: nodes };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Web App: the apiserver endpoint ----------
// doGet: read-only kubectl-style queries.  ?token=..&kind=pods|nodes|deployments
function doGet(e) {
  const p = e.parameter || {};
  if (p.token !== TOKEN) return json({ error: 'unauthorized' });
  const kind = (p.kind || 'pods').toLowerCase();
  const map = { pods: 'Pods', nodes: 'Nodes', deployments: 'Deployments', events: 'Events' };
  const tab = map[kind];
  if (!tab) return json({ error: 'unknown kind ' + kind });
  return json({ items: readTab(tab) });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json({ error: 'bad json' }); }
  if (body.token !== TOKEN) return json({ error: 'unauthorized' });

  // kubectl-style control operations (from skctl / the lab)
  if (body.action && body.action !== 'heartbeat') return controlOp(body);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // upsert node + apply agent's pod status reports
    let nodes = readTab('Nodes');
    let node = nodes.find(n => n.name === body.node);
    if (!node) {
      node = { name: body.node, ip: body.ip, cpu_total: body.cpu_total, mem_total: body.mem_total,
               cpu_used: 0, mem_used: 0, status: 'Ready', last_heartbeat: '' };
      nodes.push(node);
      event('Node', body.node, 'registered (' + body.ip + ', cpu=' + body.cpu_total + 'm)');
    }
    node.ip = body.ip;
    if (body.cpu_total) node.cpu_total = body.cpu_total;
    if (body.mem_total) node.mem_total = body.mem_total;
    node.last_heartbeat = new Date().toISOString();
    node.status = 'Ready';
    writeTab('Nodes', nodes);

    // apply pod status the agent reported (it reports only its RUNNING containers)
    {
      let pods = readTab('Pods');
      const report = {};
      (body.pods || []).forEach(r => { report[r.name] = r; });
      pods.forEach(p => {
        if (p.node !== body.node) return;
        const r = report[p.name];
        if (r) {
          if (r.container_id) p.container_id = r.container_id;
          if (p.phase === 'Scheduled') {
            p.phase = 'Running';
            if (!p.started_at) p.started_at = new Date().toISOString();
          }
        } else if (p.phase === 'Terminating') {
          // agent no longer runs it -> it's gone
          p.phase = 'Deleted';
          event('Pod', p.name, 'deleted from ' + body.node);
        }
      });
      writeTab('Pods', pods);
    }
  } finally {
    lock.releaseLock();
  }

  // run the control loop, then answer with this node's desired state
  const state = reconcile();
  const desired = [];
  state.pods.forEach(p => {
    if (p.node !== body.node) return;
    if (p.phase === 'Scheduled' || p.phase === 'Running') {
      desired.push({ name: p.name, image: p.image, command: p.command,
                     cpu_req: p.cpu_req, mem_req: p.mem_req, desired: 'Running' });
    } else if (p.phase === 'Terminating') {
      desired.push({ name: p.name, desired: 'Terminating' });
    }
  });
  return json({ pods: desired });
}

// apply / scale / delete against the Deployments tab, then kick a reconcile
function controlOp(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let deps = readTab('Deployments');
    const byName = {};
    deps.forEach(d => { byName[d.name] = d; });

    if (body.action === 'apply') {
      (body.deployments || []).forEach(spec => {
        const d = byName[spec.name];
        if (d) {
          ['image', 'replicas', 'cpu_req', 'mem_req', 'command'].forEach(k => {
            if (spec[k] !== undefined) d[k] = spec[k];
          });
          event('Deployment', spec.name, 'configured');
        } else {
          const nd = { name: spec.name, image: spec.image, replicas: spec.replicas,
                       cpu_req: spec.cpu_req || 100, mem_req: spec.mem_req || 64,
                       command: spec.command || '' };
          deps.push(nd); byName[spec.name] = nd;
          event('Deployment', spec.name, 'created');
        }
      });
    } else if (body.action === 'scale') {
      const d = byName[body.name];
      if (!d) return json({ error: 'no such deployment ' + body.name });
      d.replicas = body.replicas;
      event('Deployment', body.name, 'scaled to ' + body.replicas);
    } else if (body.action === 'delete') {
      deps = deps.filter(d => d.name !== body.name);
      event('Deployment', body.name, 'deleted');
    } else {
      return json({ error: 'unknown action ' + body.action });
    }
    writeTab('Deployments', deps);
  } finally {
    lock.releaseLock();
  }
  reconcile();
  return json({ ok: true });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- one-time setup ----------
function setup() {
  Object.keys(TABS).forEach(name => {
    let sh = ss().getSheetByName(name) || ss().insertSheet(name);
    sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  // sample deployment (nginx x3)
  const dep = ss().getSheetByName('Deployments');
  if (dep.getLastRow() < 2) {
    dep.appendRow(['nginx', 'nginx:alpine', 3, 100, 64, '']);
    dep.appendRow(['redis', 'redis:alpine', 1, 150, 128, '']);
  }
  // reconcile every minute (backstop; heartbeats also drive it)
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'reconcile') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('reconcile').timeBased().everyMinutes(1).create();
  event('System', 'setup', 'Sheeternetes initialized');
}

// ---------- demo helpers (for a browser/video proof without real Docker hosts) ----------
// Registers 3 fake nodes, schedules the current Deployments, and drives pods to Running.
// This runs the REAL reconcile()/scheduler; only the kubelet is faked.
function simulate() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let nodes = readTab('Nodes');
    ['node-a', 'node-b', 'node-c'].forEach((name, i) => {
      let n = nodes.find(x => x.name === name);
      if (!n) { n = { name: name }; nodes.push(n); }
      n.ip = '10.0.0.' + (i + 1);
      n.cpu_total = 4000; n.mem_total = 8192;
      n.status = 'Ready';
      n.last_heartbeat = new Date().toISOString();
    });
    writeTab('Nodes', nodes);
  } finally { lock.releaseLock(); }

  reconcile();  // schedule Pending -> Scheduled

  // fake the kubelet: Scheduled -> Running with a fake container id
  const lock2 = LockService.getScriptLock();
  lock2.waitLock(20000);
  try {
    let pods = readTab('Pods');
    pods.forEach(p => {
      if (p.phase === 'Scheduled') {
        p.phase = 'Running';
        p.container_id = 'fake' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);
        if (!p.started_at) p.started_at = new Date().toISOString();
      }
    });
    writeTab('Pods', pods);
  } finally { lock2.releaseLock(); }
  event('System', 'simulate', 'faked 3 nodes and drove pods to Running');
}

// Ages node-c past the heartbeat timeout so the next reconcile evicts and reschedules its pods.
function simulateNodeFailure() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let nodes = readTab('Nodes');
    const c = nodes.find(n => n.name === 'node-c');
    if (c) { c.last_heartbeat = new Date(Date.now() - 5 * 60 * 1000).toISOString(); }
    writeTab('Nodes', nodes);
  } finally { lock.releaseLock(); }
  reconcile();
  // re-run the fake kubelet on survivors so rescheduled pods show Running again
  simulate();
  event('System', 'simulateNodeFailure', 'node-c failed; pods rescheduled');
}
