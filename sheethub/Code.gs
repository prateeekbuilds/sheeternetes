/**
 * SheetHub — a GitLab-style DevOps forge on a Google Sheet.
 *
 * Part of the Sheet-Native Computing Foundation (SNCF) ecosystem.
 * Data plane: Google Sheet (tabs for Repos, Issues, MergeRequests, Releases, Users, Comments, Stars, Files).
 * Control plane / apiserver: Apps Script Web App (doGet / doPost).
 * Web UI: GitLab-style forge interface served via HtmlService.
 *
 * Deploy:
 *   1) Extensions -> Apps Script, paste this file (and index.html if using HTML service).
 *   2) Run setup() once (creates the tabs with headers and seed sample repos/MRs).
 *   3) Deploy -> New deployment -> Web app -> Execute as: Me, Access: Anyone.
 *   4) Copy the Web App URL into shctl (.shctl.env) or open directly in browser.
 */

const TOKEN = 'CHANGE_ME_super_secret';

const TABS = {
  Repos:         ['name', 'description', 'default_branch', 'visibility', 'stars_count', 'created_at', 'updated_at'],
  Issues:        ['id', 'repo', 'number', 'title', 'body', 'author', 'state', 'labels', 'created_at', 'updated_at'],
  MergeRequests: ['id', 'repo', 'number', 'title', 'description', 'author', 'source_branch', 'target_branch', 'state', 'diff_manifest', 'created_at', 'updated_at'],
  Releases:      ['id', 'repo', 'tag_name', 'name', 'body', 'author', 'created_at', 'assets'],
  Users:         ['username', 'name', 'avatar_url', 'role', 'bio', 'created_at'],
  Comments:      ['id', 'target_type', 'target_id', 'author', 'body', 'created_at'],
  Stars:         ['repo', 'username', 'starred_at'],
  Files:         ['repo', 'path', 'branch', 'content', 'updated_at'],
};

// ---------- generic sheet <-> objects ----------
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function readTab(name) {
  const s = ss();
  const sh = s.getSheetByName(name);
  if (!sh) return [];
  const rng = sh.getDataRange().getValues();
  if (!rng || rng.length < 2) return [];
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
  const s = ss();
  let sh = s.getSheetByName(name);
  if (!sh) {
    sh = s.insertSheet(name);
    sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  const header = TABS[name];
  const rows = objects.map(o => header.map(h => (o[h] === undefined || o[h] === null) ? '' : o[h]));
  const lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, header.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
}

function appendToTab(name, obj) {
  const s = ss();
  let sh = s.getSheetByName(name);
  if (!sh) {
    setupTab(name);
    sh = s.getSheetByName(name);
  }
  const header = TABS[name];
  const row = header.map(h => (obj[h] === undefined || obj[h] === null) ? '' : obj[h]);
  sh.appendRow(row);
}

function shortId() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 10);
}

// ---------- one-time setup & seed data ----------
function setupTab(name) {
  const s = ss();
  let sh = s.getSheetByName(name);
  if (!sh) sh = s.insertSheet(name);
  sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
  sh.setFrozenRows(1);
}

function setup() {
  Object.keys(TABS).forEach(name => {
    setupTab(name);
  });

  const now = new Date().toISOString();

  // Seed Users
  const users = readTab('Users');
  if (!users.length) {
    writeTab('Users', [
      { username: 'prateeekbuilds', name: 'Prateek', avatar_url: 'https://github.com/prateeekbuilds.png', role: 'Maintainer', bio: 'Spreadsheet engineer & forge builder', created_at: now },
      { username: 'tym83', name: 'Timur', avatar_url: 'https://github.com/tym83.png', role: 'SNCF Chair', bio: 'Reconciling containers since cell A1', created_at: now },
      { username: 'sheetbot', name: 'SheetBot', avatar_url: 'https://sncfoundation.github.io/logos/sheeternetes.svg', role: 'CI Bot', bio: 'Apps Script automated runner', created_at: now },
    ]);
  }

  // Seed Repos
  const repos = readTab('Repos');
  if (!repos.length) {
    writeTab('Repos', [
      {
        name: 'sncf/hello-web',
        description: 'Reference 3-tier microservice manifest for Sheeternetes',
        default_branch: 'main',
        visibility: 'public',
        stars_count: 12,
        created_at: now,
        updated_at: now
      },
      {
        name: 'sncf/sheeternetes-manifests',
        description: 'Production GitOps cluster manifests deployed via Sheetlux CD',
        default_branch: 'main',
        visibility: 'public',
        stars_count: 42,
        created_at: now,
        updated_at: now
      }
    ]);
  }

  // Seed Files / Manifests
  const files = readTab('Files');
  if (!files.length) {
    const sampleHelloSpec = JSON.stringify({
      deployments: [
        { name: 'hello-web', image: 'traefik/whoami', replicas: 3, cpu_req: 100, mem_req: 64, command: '' },
        { name: 'redis-cache', image: 'redis:alpine', replicas: 1, cpu_req: 150, mem_req: 128, command: '' }
      ]
    }, null, 2);

    const sampleClusterSpec = JSON.stringify({
      deployments: [
        { name: 'ingress-router', image: 'traefik:v2.10', replicas: 2, cpu_req: 200, mem_req: 256, command: '' },
        { name: 'metrics-collector', image: 'prom/prometheus:latest', replicas: 1, cpu_req: 300, mem_req: 512, command: '' }
      ]
    }, null, 2);

    writeTab('Files', [
      { repo: 'sncf/hello-web', path: 'app.json', branch: 'main', content: sampleHelloSpec, updated_at: now },
      { repo: 'sncf/hello-web', path: 'README.md', branch: 'main', content: '# Hello Web\n\nA resilient web service running on Sheeternetes.', updated_at: now },
      { repo: 'sncf/sheeternetes-manifests', path: 'production.json', branch: 'main', content: sampleClusterSpec, updated_at: now },
    ]);
  }

  // Seed Issues
  const issues = readTab('Issues');
  if (!issues.length) {
    writeTab('Issues', [
      {
        id: 'iss-001',
        repo: 'sncf/hello-web',
        number: 1,
        title: 'Scale hello-web to 5 replicas for traffic surge',
        body: 'Upcoming holiday campaign will increase load. We should scale hello-web from 3 to 5 replicas in app.json.',
        author: 'tym83',
        state: 'open',
        labels: 'enhancement,scaling',
        created_at: now,
        updated_at: now
      },
      {
        id: 'iss-002',
        repo: 'sncf/hello-web',
        number: 2,
        title: 'Add memory limits to redis-cache container',
        body: 'Currently redis-cache has mem_req 128MiB. Let us ensure it has proper resource reservations.',
        author: 'prateeekbuilds',
        state: 'closed',
        labels: 'performance',
        created_at: now,
        updated_at: now
      }
    ]);
  }

  // Seed MergeRequests
  const mrs = readTab('MergeRequests');
  if (!mrs.length) {
    const diffExample = JSON.stringify({
      path: 'app.json',
      before: {
        deployments: [
          { name: 'hello-web', image: 'traefik/whoami', replicas: 3, cpu_req: 100, mem_req: 64, command: '' },
          { name: 'redis-cache', image: 'redis:alpine', replicas: 1, cpu_req: 150, mem_req: 128, command: '' }
        ]
      },
      after: {
        deployments: [
          { name: 'hello-web', image: 'traefik/whoami', replicas: 5, cpu_req: 100, mem_req: 64, command: '' },
          { name: 'redis-cache', image: 'redis:7-alpine', replicas: 2, cpu_req: 150, mem_req: 256, command: '' }
        ]
      }
    }, null, 2);

    writeTab('MergeRequests', [
      {
        id: 'mr-001',
        repo: 'sncf/hello-web',
        number: 1,
        title: 'Scale hello-web to 5 replicas & upgrade redis',
        description: 'Resolves #1. Increases replica count to handle surge traffic and bumps redis version.',
        author: 'prateeekbuilds',
        source_branch: 'scale-up-v2',
        target_branch: 'main',
        state: 'open',
        diff_manifest: diffExample,
        created_at: now,
        updated_at: now
      }
    ]);
  }

  // Seed Releases
  const releases = readTab('Releases');
  if (!releases.length) {
    writeTab('Releases', [
      {
        id: 'rel-001',
        repo: 'sncf/hello-web',
        tag_name: 'v1.0.0',
        name: 'v1.0.0: Initial Production Rollout',
        body: 'First stable release deployed to Sheeternetes cluster via Sheetlux CD.',
        author: 'prateeekbuilds',
        created_at: now,
        assets: 'app.json'
      }
    ]);
  }

  // Seed Comments
  const comments = readTab('Comments');
  if (!comments.length) {
    writeTab('Comments', [
      {
        id: 'comm-001',
        target_type: 'mr',
        target_id: 'mr-001',
        author: 'tym83',
        body: 'Diff looks clean! The memory bump on redis is well within node capacity. CI passed.',
        created_at: now
      },
      {
        id: 'comm-002',
        target_type: 'issue',
        target_id: 'iss-001',
        author: 'prateeekbuilds',
        body: 'MR !1 opened addressing this.',
        created_at: now
      }
    ]);
  }

  // Seed Stars
  const stars = readTab('Stars');
  if (!stars.length) {
    writeTab('Stars', [
      { repo: 'sncf/hello-web', username: 'prateeekbuilds', starred_at: now },
      { repo: 'sncf/hello-web', username: 'tym83', starred_at: now },
      { repo: 'sncf/sheeternetes-manifests', username: 'prateeekbuilds', starred_at: now },
    ]);
  }
}

// ---------- Web App: apiserver endpoint ----------
// doGet: query forge resources or render web UI
function doGet(e) {
  const p = (e && e.parameter) || {};

  // If queried as an API endpoint with token or kind parameter
  if (p.kind || p.api === '1' || p.token) {
    if (p.token && p.token !== TOKEN) return json({ error: 'unauthorized' });

    const kind = (p.kind || 'repos').toLowerCase();
    const repoFilter = p.repo || '';

    const map = {
      repos: 'Repos',
      issues: 'Issues',
      mergerequests: 'MergeRequests',
      mrs: 'MergeRequests',
      releases: 'Releases',
      users: 'Users',
      comments: 'Comments',
      stars: 'Stars',
      files: 'Files',
    };

    const tab = map[kind];
    if (!tab) return json({ error: 'unknown kind ' + kind });

    let items = readTab(tab);
    if (repoFilter && ['Issues', 'MergeRequests', 'Releases', 'Files', 'Stars'].indexOf(tab) !== -1) {
      items = items.filter(it => String(it.repo).toLowerCase() === repoFilter.toLowerCase());
    }

    if (p.id) {
      items = items.filter(it => String(it.id) === String(p.id) || String(it.number) === String(p.id));
    }

    return json({ items: items });
  }

  // Default browser visit: render HTML UI
  try {
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('SheetHub — DevOps Forge on a Spreadsheet')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    // Fallback if index.html is not embedded in Apps Script project
    return json({
      message: 'SheetHub apiserver running. Provide ?kind=repos|issues|mergerequests to query resources.',
      endpoints: [
        'GET ?kind=repos',
        'GET ?kind=issues&repo=sncf/hello-web',
        'GET ?kind=mergerequests&repo=sncf/hello-web',
        'GET ?kind=releases&repo=sncf/hello-web',
        'GET ?kind=files&repo=sncf/hello-web'
      ]
    });
  }
}

// doPost: mutation operations (create issue, MR, comment, merge, file put)
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json({ error: 'bad json' }); }

  if (body.token && body.token !== TOKEN) return json({ error: 'unauthorized' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const action = body.action || 'apply';
    const now = new Date().toISOString();

    if (action === 'create_issue') {
      const issues = readTab('Issues');
      const repoIssues = issues.filter(i => i.repo === body.repo);
      const nextNum = repoIssues.length ? Math.max(...repoIssues.map(i => Number(i.number) || 0)) + 1 : 1;
      const issue = {
        id: 'iss-' + shortId(),
        repo: body.repo,
        number: nextNum,
        title: body.title || 'Untitled Issue',
        body: body.body || '',
        author: body.author || 'anonymous',
        state: 'open',
        labels: body.labels || 'issue',
        created_at: now,
        updated_at: now
      };
      issues.push(issue);
      writeTab('Issues', issues);
      return json({ ok: true, issue: issue });
    }

    if (action === 'create_mr') {
      const mrs = readTab('MergeRequests');
      const repoMrs = mrs.filter(m => m.repo === body.repo);
      const nextNum = repoMrs.length ? Math.max(...repoMrs.map(m => Number(m.number) || 0)) + 1 : 1;
      const mr = {
        id: 'mr-' + shortId(),
        repo: body.repo,
        number: nextNum,
        title: body.title || 'Untitled MR',
        description: body.description || '',
        author: body.author || 'anonymous',
        source_branch: body.source_branch || 'feature',
        target_branch: body.target_branch || 'main',
        state: 'open',
        diff_manifest: typeof body.diff_manifest === 'string' ? body.diff_manifest : JSON.stringify(body.diff_manifest || {}, null, 2),
        created_at: now,
        updated_at: now
      };
      mrs.push(mr);
      writeTab('MergeRequests', mrs);
      return json({ ok: true, mr: mr });
    }

    if (action === 'merge_mr') {
      const mrs = readTab('MergeRequests');
      const mr = mrs.find(m => m.id === body.mr_id || String(m.number) === String(body.mr_id));
      if (!mr) return json({ error: 'MR not found' });
      mr.state = 'merged';
      mr.updated_at = now;
      writeTab('MergeRequests', mrs);

      // If diff contains updated file content, apply it to target branch in Files tab
      try {
        const diff = JSON.parse(mr.diff_manifest);
        if (diff.path && diff.after) {
          const files = readTab('Files');
          let f = files.find(x => x.repo === mr.repo && x.path === diff.path && x.branch === mr.target_branch);
          if (f) {
            f.content = typeof diff.after === 'string' ? diff.after : JSON.stringify(diff.after, null, 2);
            f.updated_at = now;
          } else {
            files.push({
              repo: mr.repo,
              path: diff.path,
              branch: mr.target_branch,
              content: typeof diff.after === 'string' ? diff.after : JSON.stringify(diff.after, null, 2),
              updated_at: now
            });
          }
          writeTab('Files', files);
        }
      } catch (err) { /* ignore diff parsing if non-json */ }

      return json({ ok: true, mr: mr });
    }

    if (action === 'put_file') {
      const files = readTab('Files');
      let f = files.find(x => x.repo === body.repo && x.path === body.path && x.branch === (body.branch || 'main'));
      if (f) {
        f.content = body.content || '';
        f.updated_at = now;
      } else {
        files.push({
          repo: body.repo,
          path: body.path,
          branch: body.branch || 'main',
          content: body.content || '',
          updated_at: now
        });
      }
      writeTab('Files', files);
      return json({ ok: true });
    }

    if (action === 'add_comment') {
      const comments = readTab('Comments');
      const comment = {
        id: 'comm-' + shortId(),
        target_type: body.target_type || 'issue',
        target_id: body.target_id,
        author: body.author || 'anonymous',
        body: body.body || '',
        created_at: now
      };
      comments.push(comment);
      writeTab('Comments', comments);
      return json({ ok: true, comment: comment });
    }

    return json({ error: 'unknown action: ' + action });
  } finally {
    lock.releaseLock();
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
