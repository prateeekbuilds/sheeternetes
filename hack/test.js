#!/usr/bin/env node
// Unit test for the Sheeternetes control plane: mocks the Apps Script Sheet
// layer and runs the REAL Code.gs reconcile()/scheduler in Node. Asserts
// scheduling, scaling, overcommit protection, and node-failure eviction.
//
//   node hack/test.js
const fs = require('fs');
const path = require('path');
const codeText = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

// ---- in-memory Google Sheet mock ----
function makeSheet(h) { return { grid: [h.slice()] }; }
function lastNonEmpty(g) {
  for (let r = g.length; r >= 1; r--) if ((g[r-1]||[]).some(c => c!=='' && c!=null)) return r;
  return 1;
}
function rangeObj(s, row, col, nr, nc) {
  const o = {
    clearContent() { for (let i=0;i<nr;i++){const r=row-1+i;if(!s.grid[r])s.grid[r]=[];for(let j=0;j<nc;j++)s.grid[r][col-1+j]='';} return o; },
    setValues(v) { for (let i=0;i<v.length;i++){const r=row-1+i;if(!s.grid[r])s.grid[r]=[];for(let j=0;j<v[i].length;j++)s.grid[r][col-1+j]=v[i][j];} return o; },
    setFontWeight() { return o; },
  };
  return o;
}
function api2(s) {
  return {
    getDataRange: () => ({ getValues: () => s.grid.map(r => r.slice()) }),
    getRange: (r,c,nr,nc) => rangeObj(s,r,c,nr,nc),
    getLastRow: () => lastNonEmpty(s.grid),
    appendRow: (a) => { s.grid.push(a.slice()); },
    deleteRows: (st,n) => { s.grid.splice(st-1,n); },
    setFrozenRows: () => {},
  };
}
const store = {
  Deployments: makeSheet(['name','image','replicas','cpu_req','mem_req','command']),
  Nodes: makeSheet(['name','ip','cpu_total','mem_total','cpu_used','mem_used','status','last_heartbeat']),
  Pods: makeSheet(['name','deployment','node','phase','container_id','image','cpu_req','mem_req','command','node_ip','started_at','message']),
  Events: makeSheet(['ts','kind','object','message']),
};
const SpreadsheetApp = { getActiveSpreadsheet: () => ({
  getId: () => 'test', getSheetByName: (n) => api2(store[n]),
  insertSheet: (n) => { store[n]=store[n]||makeSheet([]); return api2(store[n]); } }) };
let uuidN = 0;
const Utilities = { getUuid: () => (++uuidN).toString(36).split('').reverse().join('').padEnd(8,'0') };
const LockService = { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) };
const ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ _t: t, setMimeType() { return this; } }) };
const ScriptApp = { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create(){} }) }) }) };

const api = new Function('SpreadsheetApp','Utilities','LockService','ContentService','ScriptApp',
  codeText + '\nreturn { reconcile, controlOp, doPost, readTab };')(SpreadsheetApp, Utilities, LockService, ContentService, ScriptApp);

const TOKEN = 'CHANGE_ME_super_secret';
const heartbeat = (node, cpu) => JSON.parse(api.doPost({ postData: { contents: JSON.stringify({
  token: TOKEN, action: 'heartbeat', node, ip: '10.0.0.1', cpu_total: cpu, mem_total: 2048, pods: [] })}})._t);
const apply = (d) => JSON.parse(api.controlOp({ token: TOKEN, action: 'apply', deployments: d })._t);
const scale = (name, replicas) => JSON.parse(api.controlOp({ token: TOKEN, action: 'scale', name, replicas })._t);
const pods = () => api.readTab('Pods');
const nodes = () => api.readTab('Nodes');
const dist = () => { const d={}; pods().forEach(p=>{ if(p.phase!=='Terminating'&&p.phase!=='Deleted') d[p.node||'UNSCHEDULED']=(d[p.node||'UNSCHEDULED']||0)+1; }); return d; };
let pass=0, fail=0;
const check = (n,c,d)=>{ if(c){pass++;console.log('  PASS',n);} else {fail++;console.log('  FAIL',n,'->',JSON.stringify(d));} };

console.log('\n== A: 3 nodes present, deploy nginx x3 ==');
heartbeat('node-a',2000); heartbeat('node-b',2000); heartbeat('node-c',2000);
apply([{name:'nginx',image:'nginx:alpine',replicas:3,cpu_req:100,mem_req:64,command:''}]); api.reconcile();
console.log('  distribution:', JSON.stringify(dist()));
check('3 nginx pods', pods().filter(p=>p.deployment==='nginx').length===3, pods().length);
check('all scheduled', !dist().UNSCHEDULED, dist());
check('spread across >1 node', Object.keys(dist()).length>1, dist());

console.log('\n== B: scale nginx to 6 ==');
scale('nginx',6); api.reconcile();
console.log('  distribution:', JSON.stringify(dist()));
check('6 nginx pods', pods().filter(p=>p.deployment==='nginx'&&p.phase!=='Terminating').length===6, pods().length);

console.log('\n== C: overcommit hog x20 (cpu 1000, cluster 6000) ==');
apply([{name:'hog',image:'nginx:alpine',replicas:20,cpu_req:1000,mem_req:64,command:''}]); api.reconcile();
const unsched = pods().filter(p=>p.deployment==='hog'&&!p.node).length;
console.log('  hog unscheduled:', unsched);
check('some hog pods unschedulable', unsched>0, unsched);

console.log('\n== D: node-c dies -> reschedule ==');
scale('hog',0); api.reconcile();
const ns=store.Nodes, hdr=ns.grid[0], iHb=hdr.indexOf('last_heartbeat'), iName=hdr.indexOf('name');
for (let r=1;r<ns.grid.length;r++) if (ns.grid[r][iName]==='node-c') ns.grid[r][iHb]=new Date(Date.now()-5*60*1000).toISOString();
api.reconcile();
console.log('  distribution:', JSON.stringify(dist()));
check('node-c NotReady', nodes().find(n=>n.name==='node-c').status==='NotReady', nodes().find(n=>n.name==='node-c').status);
check('no live pods on node-c', pods().filter(p=>p.node==='node-c'&&p.phase!=='Terminating').length===0, dist());
check('nginx still 6 live pods', pods().filter(p=>p.deployment==='nginx'&&p.phase!=='Terminating'&&p.node).length===6, dist());

// simulate the kubelet flipping this node's Scheduled pods to Running
function driveRunning() {
  const byNode = {};
  pods().forEach(p => { if (p.phase==='Scheduled'||p.phase==='Running') {
    (byNode[p.node]=byNode[p.node]||[]).push({name:p.name,phase:'Running',container_id:'c-'+p.name}); } });
  Object.keys(byNode).forEach(n => api.doPost({ postData: { contents: JSON.stringify({
    token:TOKEN, action:'heartbeat', node:n, ip:'10.0.0.1', cpu_total:2000, mem_total:2048, pods:byNode[n] })}}));
}

console.log('\n== E: restart-on-crash ==');
driveRunning();  // everything Running
const target = pods().find(p => p.deployment==='nginx' && p.node && p.phase==='Running');
const tnode = target.node;
// heartbeat tnode WITHOUT the target (its container crashed/exited)
const others = pods().filter(p => p.node===tnode && p.phase==='Running' && p.name!==target.name)
  .map(p => ({name:p.name, phase:'Running', container_id:'c-'+p.name}));
api.doPost({ postData: { contents: JSON.stringify({ token:TOKEN, action:'heartbeat',
  node:tnode, ip:'10.0.0.1', cpu_total:2000, mem_total:2048, pods:others })}});
const restarted = pods().find(p => p.name===target.name);
check('crashed pod goes back to Scheduled (restart)', restarted && restarted.phase==='Scheduled', restarted && restarted.phase);
check('restarted pod stays on same node', restarted && restarted.node===tnode, restarted && restarted.node);

console.log('\n== F: rolling update on image change ==');
apply([{name:'nginx', image:'nginx:1.27-alpine', replicas:6, cpu_req:100, mem_req:64, command:''}]);
for (let i=0;i<25;i++) { api.reconcile(); driveRunning(); }
const liveNginx = pods().filter(p => p.deployment==='nginx' && p.phase!=='Terminating' && p.phase!=='Deleted');
check('all live nginx pods on the new image', liveNginx.length>0 && liveNginx.every(p => p.image==='nginx:1.27-alpine'), liveNginx.map(p=>p.image));
check('still 6 live nginx replicas after roll', liveNginx.filter(p=>p.node).length===6, liveNginx.length);

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail?1:0);
