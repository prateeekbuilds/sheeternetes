#!/usr/bin/env node
// Local drop-in for the Apps Script apiserver — runs the REAL Code.gs control
// plane (reconcile + scheduler + controllers) with an in-memory store instead
// of a Google Sheet. Lets you test the kubelet + Docker path end-to-end without
// deploying anything to Google. Point kubelets at http://localhost:8787/exec.
//
//   node hack/local-apiserver.js
//
// This is a TEST HARNESS. The real control plane is Code.gs running in Apps
// Script on top of an actual spreadsheet. Same code, different datastore.
const http = require('http');
const fs = require('fs');
const path = require('path');

const codeText = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

// ---- in-memory Google Sheet mock (same shape as the real Sheet) ----
function makeSheet(header) { return { grid: [header.slice()] }; }
function lastNonEmpty(grid) {
  for (let r = grid.length; r >= 1; r--) {
    const row = grid[r - 1] || [];
    if (row.some(c => c !== '' && c !== undefined && c !== null)) return r;
  }
  return 1;
}
function rangeObj(sheet, row, col, numRows, numCols) {
  const o = {
    clearContent() {
      for (let i = 0; i < numRows; i++) {
        const r = row - 1 + i; if (!sheet.grid[r]) sheet.grid[r] = [];
        for (let j = 0; j < numCols; j++) sheet.grid[r][col - 1 + j] = '';
      } return o;
    },
    setValues(vals) {
      for (let i = 0; i < vals.length; i++) {
        const r = row - 1 + i; if (!sheet.grid[r]) sheet.grid[r] = [];
        for (let j = 0; j < vals[i].length; j++) sheet.grid[r][col - 1 + j] = vals[i][j];
      } return o;
    },
    setFontWeight() { return o; },
  };
  return o;
}
function makeSheetApi(sheet) {
  return {
    getDataRange: () => ({ getValues: () => sheet.grid.map(r => r.slice()) }),
    getRange: (r, c, nr, nc) => rangeObj(sheet, r, c, nr, nc),
    getLastRow: () => lastNonEmpty(sheet.grid),
    appendRow: (arr) => { sheet.grid.push(arr.slice()); },
    deleteRows: (start, num) => { sheet.grid.splice(start - 1, num); },
    setFrozenRows: () => {},
  };
}
const store = {
  Deployments: makeSheet(['name', 'image', 'replicas', 'cpu_req', 'mem_req', 'command']),
  Nodes: makeSheet(['name', 'ip', 'cpu_total', 'mem_total', 'cpu_used', 'mem_used', 'status', 'last_heartbeat']),
  Pods: makeSheet(['name', 'deployment', 'node', 'phase', 'container_id', 'image', 'cpu_req', 'mem_req', 'command', 'node_ip', 'started_at', 'message']),
  Events: makeSheet(['ts', 'kind', 'object', 'message']),
};
const SpreadsheetApp = { getActiveSpreadsheet: () => ({
  getId: () => 'local', getSheetByName: (n) => makeSheetApi(store[n]),
  insertSheet: (n) => { store[n] = store[n] || makeSheet([]); return makeSheetApi(store[n]); },
}) };
let uuidN = 0;
// real Apps Script getUuid() is random; mock it so the FIRST chars vary (shortId
// takes substring(0,5)), by reversing the counter's base36 digits.
const Utilities = { getUuid: () => (++uuidN).toString(36).split('').reverse().join('').padEnd(8, '0') };
const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
const ContentService = { MimeType: { JSON: 'json' },
  createTextOutput: (t) => ({ _t: t, setMimeType() { return this; } }) };
const ScriptApp = { getProjectTriggers: () => [],
  newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }) };

const api = new Function(
  'SpreadsheetApp', 'Utilities', 'LockService', 'ContentService', 'ScriptApp',
  codeText + '\nreturn { doGet, doPost, setup };'
)(SpreadsheetApp, Utilities, LockService, ContentService, ScriptApp);

api.setup();  // seed tabs + sample deployments (nginx x3, redis x1)

const PORT = process.env.PORT || 8787;
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const send = (out) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(out); };
  if (req.method === 'GET') {
    const e = { parameter: Object.fromEntries(u.searchParams) };
    send(api.doGet(e)._t);
  } else {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => { try { send(api.doPost({ postData: { contents: b } })._t); }
      catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: String(err) })); } });
  }
}).listen(PORT, () => console.log(`[local-apiserver] Code.gs control plane on http://localhost:${PORT}/exec`));
