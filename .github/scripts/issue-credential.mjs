#!/usr/bin/env node
// Issues a sequential CSFE credential from a `certification` issue.
// Serial format: SFE + 6-digit zero-padded running number (9 chars, e.g. SFE000042).
// The registry lives in docs/registry so it is browsable on GitHub *and* served on Pages.
// Serialized by the workflow `concurrency` group, so the counter is race-free.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const REGISTRY_DIR = "docs/registry";
const INDEX_JSON = `${REGISTRY_DIR}/index.json`;
const INDEX_MD = `${REGISTRY_DIR}/index.md`;
const PAGES_BASE = "https://tym83.github.io/sheeternetes";

const {
  ISSUE_NUMBER,
  HOLDER,
  ISSUE_URL,
  ISSUE_BODY = "",
  RELEASE_TAG = "",
} = process.env;

if (!ISSUE_NUMBER || !HOLDER) {
  console.error("Missing ISSUE_NUMBER or HOLDER");
  process.exit(1);
}

const sh = (cmd) => execSync(cmd, { stdio: ["ignore", "pipe", "inherit"] }).toString().trim();
const run = (cmd) => execSync(cmd, { stdio: "inherit" });

// --- parse self-reported score from the issue-form body -----------------------
function parseScore(body) {
  const m = body.match(/#+\s*Exam score\s*\n+([^\n]+)/i);
  if (!m) return "";
  const v = m[1].trim();
  if (!v || /^_no response_$/i.test(v)) return "";
  return v.slice(0, 20);
}
const score = parseScore(ISSUE_BODY);

// --- load registry ------------------------------------------------------------
let index = { certificates: [] };
if (existsSync(INDEX_JSON)) {
  try { index = JSON.parse(readFileSync(INDEX_JSON, "utf8")); }
  catch { index = { certificates: [] }; }
}
if (!Array.isArray(index.certificates)) index.certificates = [];

const holderLc = HOLDER.toLowerCase();

// --- idempotency: one credential per GitHub account ---------------------------
const existing = index.certificates.find((c) => (c.holder || "").toLowerCase() === holderLc);
if (existing) {
  const verify = `${PAGES_BASE}/verify.html?id=${existing.serial}`;
  const body = [
    `**@${HOLDER} is already certified.** ✅`,
    ``,
    `Credential ID: \`${existing.serial}\` — issued ${existing.date}.`,
    `A GitHub account gets exactly one CSFE. Verify: ${verify}`,
    ``,
    `_The Spreadsheet does not reconcile duplicates._`,
  ].join("\n");
  writeFileSync("comment.md", body);
  run(`gh issue comment ${ISSUE_NUMBER} --body-file comment.md`);
  run(`gh issue edit ${ISSUE_NUMBER} --add-label duplicate`);
  run(`gh issue close ${ISSUE_NUMBER} --reason completed`);
  console.log(`Duplicate: ${HOLDER} already holds ${existing.serial}`);
  process.exit(0);
}

// --- assign next sequential serial --------------------------------------------
const maxSeq = index.certificates.reduce((max, c) => {
  const n = parseInt(String(c.serial || "").replace(/^SFE/, ""), 10);
  return Number.isFinite(n) && n > max ? n : max;
}, 0);
const seq = maxSeq + 1;
const serial = "SFE" + String(seq).padStart(6, "0");

const date = new Date().toISOString().slice(0, 10); // UTC, runners are UTC

const record = {
  serial,
  seq,
  holder: HOLDER,
  date,
  score,
  release: RELEASE_TAG || null,
  issue: ISSUE_URL,
  issue_number: Number(ISSUE_NUMBER),
  program: "Certified Sheeternetes Fundamentals Engineer (CSFE)",
};

// --- write per-certificate file + update index --------------------------------
writeFileSync(`${REGISTRY_DIR}/${serial}.json`, JSON.stringify(record, null, 2) + "\n");
index.certificates.push(record);
index.certificates.sort((a, b) => a.seq - b.seq);
index.count = index.certificates.length;
index.updated = date;
writeFileSync(INDEX_JSON, JSON.stringify(index, null, 2) + "\n");

// --- regenerate a human-readable table for GitHub folder browsing -------------
const rows = index.certificates
  .map((c) => `| \`${c.serial}\` | [@${c.holder}](https://github.com/${c.holder}) | ${c.date} | ${c.score || "—"} | ${c.release || "—"} | [#${c.issue_number}](${c.issue}) |`)
  .join("\n");
const md = `# CSFE Certificate Registry

The public, tamper-evident registry of everyone certified as a
**Certified Sheeternetes Fundamentals Engineer (CSFE)**.

- **${index.certificates.length}** credentials issued to date.
- Anyone (HR, hiring managers, the merely curious) can verify a holder here or at
  [${PAGES_BASE}/verify.html](${PAGES_BASE}/verify.html).
- Each credential is a JSON file in this folder (\`SFEnnnnnn.json\`) and a row below.
- Serials are sequential and assigned by an automated workflow — they cannot be self-minted.

| Serial | Holder | Issued | Score | Release | Request |
|--------|--------|--------|-------|---------|---------|
${rows}
`;
writeFileSync(INDEX_MD, md);

// --- commit & push (serialized by workflow concurrency group) -----------------
run(`git config user.name "sheeternetes-bot"`);
run(`git config user.email "actions@users.noreply.github.com"`);
run(`git add ${REGISTRY_DIR}`);
run(`git commit -m "cert: issue ${serial} to @${HOLDER}"`);
// belt-and-suspenders against a concurrent push, though concurrency serializes us
try { run(`git pull --rebase origin master`); } catch { /* nothing to rebase */ }
run(`git push origin HEAD:master`);

// --- notify the requester and close ------------------------------------------
const verify = `${PAGES_BASE}/verify.html?id=${serial}`;
const comment = [
  `# 🎉 Certified. Welcome to the Spreadsheet, @${HOLDER}.`,
  ``,
  `You are now a **Certified Sheeternetes Fundamentals Engineer (CSFE)**.`,
  ``,
  `| Field | Value |`,
  `|-------|-------|`,
  `| **Credential ID** | \`${serial}\` |`,
  `| **Holder** | @${HOLDER} |`,
  `| **Issued** | ${date} |`,
  `| **Score** | ${score || "—"} |`,
  `| **Release** | ${RELEASE_TAG || "—"} |`,
  ``,
  `**Verify / download your certificate:** ${verify}`,
  ``,
  `Your entry is now permanently recorded in the [public registry](${PAGES_BASE}/registry/) —`,
  `hand this URL to any HR who doubts you. It reconciles.`,
].join("\n");
writeFileSync("comment.md", comment);
run(`gh issue comment ${ISSUE_NUMBER} --body-file comment.md`);
run(`gh issue edit ${ISSUE_NUMBER} --add-label issued`);
run(`gh issue close ${ISSUE_NUMBER} --reason completed`);

console.log(`Issued ${serial} to ${HOLDER}`);
