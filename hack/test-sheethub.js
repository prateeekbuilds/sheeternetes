#!/usr/bin/env node
// Unit test for SheetHub: mocks the Apps Script Sheet layer and runs
// the real sheethub/Code.gs functions in Node.js.
// Asserts tab initialization, seed data, doGet query contract, and mutation actions.
//
// Usage: node hack/test-sheethub.js

const fs = require('fs');
const path = require('path');

const codeText = fs.readFileSync(path.join(__dirname, '..', 'sheethub', 'Code.gs'), 'utf8');

// ---- In-memory Google Sheet mock ----
function makeSheet(h) { return { grid: [h.slice()] }; }
function lastNonEmpty(g) {
  for (let r = g.length; r >= 1; r--) {
    if ((g[r - 1] || []).some(c => c !== '' && c != null)) return r;
  }
  return 1;
}

function rangeObj(s, row, col, nr, nc) {
  const o = {
    clearContent() {
      for (let i = 0; i < nr; i++) {
        const r = row - 1 + i;
        if (!s.grid[r]) s.grid[r] = [];
        for (let j = 0; j < nc; j++) s.grid[r][col - 1 + j] = '';
      }
      return o;
    },
    setValues(v) {
      for (let i = 0; i < v.length; i++) {
        const r = row - 1 + i;
        if (!s.grid[r]) s.grid[r] = [];
        for (let j = 0; j < v[i].length; j++) s.grid[r][col - 1 + j] = v[i][j];
      }
      return o;
    },
    setFontWeight() { return o; },
  };
  return o;
}

function api2(s) {
  return {
    getDataRange: () => ({ getValues: () => s.grid.map(r => r.slice()) }),
    getRange: (r, c, nr, nc) => rangeObj(s, r, c, nr, nc),
    getLastRow: () => lastNonEmpty(s.grid),
    appendRow: (a) => { s.grid.push(a.slice()); },
    deleteRows: (st, n) => { s.grid.splice(st - 1, n); },
    setFrozenRows: () => {},
  };
}

const store = {
  Repos: makeSheet(['name', 'description', 'default_branch', 'visibility', 'stars_count', 'created_at', 'updated_at']),
  Issues: makeSheet(['id', 'repo', 'number', 'title', 'body', 'author', 'state', 'labels', 'created_at', 'updated_at']),
  MergeRequests: makeSheet(['id', 'repo', 'number', 'title', 'description', 'author', 'source_branch', 'target_branch', 'state', 'diff_manifest', 'created_at', 'updated_at']),
  Releases: makeSheet(['id', 'repo', 'tag_name', 'name', 'body', 'author', 'created_at', 'assets']),
  Users: makeSheet(['username', 'name', 'avatar_url', 'role', 'bio', 'created_at']),
  Comments: makeSheet(['id', 'target_type', 'target_id', 'author', 'body', 'created_at']),
  Stars: makeSheet(['repo', 'username', 'starred_at']),
  Files: makeSheet(['repo', 'path', 'branch', 'content', 'updated_at']),
};

const SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getId: () => 'sheethub-test',
    getSheetByName: (n) => (store[n] ? api2(store[n]) : null),
    insertSheet: (n) => {
      store[n] = store[n] || makeSheet([]);
      return api2(store[n]);
    }
  })
};

let uuidN = 0;
const Utilities = { getUuid: () => (++uuidN).toString(36).split('').reverse().join('').padEnd(8, '0') };
const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
const ContentService = {
  MimeType: { JSON: 'json' },
  createTextOutput: (t) => ({ _t: t, setMimeType() { return this; } })
};
const HtmlService = {
  XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
  createHtmlOutputFromFile: () => ({ setTitle() { return this; }, setXFrameOptionsMode() { return this; } })
};

const api = new Function(
  'SpreadsheetApp', 'Utilities', 'LockService', 'ContentService', 'HtmlService',
  codeText + '\nreturn { setup, readTab, writeTab, doGet, doPost };'
)(SpreadsheetApp, Utilities, LockService, ContentService, HtmlService);

let pass = 0, fail = 0;
const check = (n, c, d) => {
  if (c) {
    pass++;
    console.log('  PASS', n);
  } else {
    fail++;
    console.log('  FAIL', n, '->', JSON.stringify(d));
  }
};

console.log('\n== A: Setup & Seed SheetHub Tabs ==');
api.setup();

const repos = api.readTab('Repos');
check('Repos tab populated', repos.length >= 2, repos.length);
check('hello-web repo exists', repos.some(r => r.name === 'sncf/hello-web'), repos.map(r => r.name));

const issues = api.readTab('Issues');
check('Issues tab populated', issues.length >= 2, issues.length);
check('Issue #1 exists for hello-web', issues.some(i => i.repo === 'sncf/hello-web' && Number(i.number) === 1), issues);

const mrs = api.readTab('MergeRequests');
check('MergeRequests tab populated', mrs.length >= 1, mrs.length);
check('MR !1 has diff_manifest JSON', mrs[0].diff_manifest && JSON.parse(mrs[0].diff_manifest).path === 'app.json', mrs[0]);

const files = api.readTab('Files');
check('Files tab populated with app.json', files.some(f => f.repo === 'sncf/hello-web' && f.path === 'app.json'), files.map(f => f.path));

console.log('\n== B: doGet SNCF Query Contract ==');
const reqRepos = JSON.parse(api.doGet({ parameter: { kind: 'repos' } })._t);
check('doGet ?kind=repos returns items array', Array.isArray(reqRepos.items) && reqRepos.items.length >= 2, reqRepos);

const reqIssues = JSON.parse(api.doGet({ parameter: { kind: 'issues', repo: 'sncf/hello-web' } })._t);
check('doGet ?kind=issues&repo=... filters by repo', reqIssues.items.every(i => i.repo === 'sncf/hello-web'), reqIssues.items);

const reqMrs = JSON.parse(api.doGet({ parameter: { kind: 'mrs', repo: 'sncf/hello-web' } })._t);
check('doGet ?kind=mrs returns merge requests', reqMrs.items.length >= 1 && reqMrs.items[0].source_branch === 'scale-up-v2', reqMrs);

console.log('\n== C: doPost Issue & MR Creation ==');
const newIssueRes = JSON.parse(api.doPost({
  postData: {
    contents: JSON.stringify({
      token: 'CHANGE_ME_super_secret',
      action: 'create_issue',
      repo: 'sncf/hello-web',
      title: 'Support health checks',
      body: 'Add /healthz probe to whoami spec',
      author: 'contributor1'
    })
  }
})._t);
check('create_issue returns ok with next number', newIssueRes.ok && newIssueRes.issue.number === 3, newIssueRes);

const allIssues = api.readTab('Issues');
check('new issue recorded in tab', allIssues.some(i => i.title === 'Support health checks'), allIssues.map(i => i.title));

console.log('\n== D: MR Merge Lifecycle & Files Tab Update ==');
const mergeRes = JSON.parse(api.doPost({
  postData: {
    contents: JSON.stringify({
      token: 'CHANGE_ME_super_secret',
      action: 'merge_mr',
      mr_id: 'mr-001'
    })
  }
})._t);
check('merge_mr succeeds and marks state=merged', mergeRes.ok && mergeRes.mr.state === 'merged', mergeRes);

const updatedFiles = api.readTab('Files');
const helloAppFile = updatedFiles.find(f => f.repo === 'sncf/hello-web' && f.path === 'app.json');
check('merged diff applied to Files tab', helloAppFile && JSON.parse(helloAppFile.content).deployments[0].replicas === 5, helloAppFile);

console.log(`\n==== SheetHub Test Results: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
