# SheetHub

> **GitLab on a spreadsheet** — an all-in-one DevOps forge whose data plane is a Google Sheet: source metadata, issues, merge requests, releases, users, and CI, all in one workbook.

SheetHub is the developer platform component of the [Sheet-Native Computing Foundation (SNCF)](https://sncfoundation.github.io/).

---

## The Vision: Self-Hosting SNCF Stack

SheetHub closes the loop on spreadsheet-native infrastructure:

```
  ┌───────────────────────┐
  │       SheetHub        │  ──►  Developer Forge (Repos, Issues, MRs, Manifests)
  │     (Google Sheet)    │
  └──────────┬────────────┘
             │
             ▼
  ┌───────────────────────┐
  │      Sheetlux CD      │  ──►  GitOps Continuous Deployment reconciler
  │     (./sheetlux)      │
  └──────────┬────────────┘
             │
             ▼
  ┌───────────────────────┐
  │     Sheeternetes      │  ──►  Container Orchestration Control Plane
  │   (Apps Script + K8s) │
  └──────────┬────────────┘
             │
             ▼
  ┌───────────────────────┐
  │     Docker Pods       │  ──►  Running Services + Sheetlium DNS
  └───────────────────────┘
```

**Forge, CI, CD, and cluster are all a Sheet.** Zero YAML, zero complex hosting — it reconciles.

---

## Data Plane Schema (Tabs as Tables)

| Tab | Columns / Schema | Description |
| --- | --- | --- |
| **`Repos`** | `name, description, default_branch, visibility, stars_count, created_at, updated_at` | Repository metadata and stars |
| **`Issues`** | `id, repo, number, title, body, author, state, labels, created_at, updated_at` | Issue tracking system |
| **`MergeRequests`** | `id, repo, number, title, description, author, source_branch, target_branch, state, diff_manifest, created_at, updated_at` | Merge requests with visual spec diffs |
| **`Releases`** | `id, repo, tag_name, name, body, author, created_at, assets` | Release tags & artifact manifest registry |
| **`Users`** | `username, name, avatar_url, role, bio, created_at` | Contributor identity & profiles |
| **`Comments`** | `id, target_type, target_id, author, body, created_at` | Discussions on issues and MRs |
| **`Stars`** | `repo, username, starred_at` | Star registry |
| **`Files`** | `repo, path, branch, content, updated_at` | Manifest files and workload definitions |

---

## Quickstart

### 1. Control Plane Setup (Google Apps Script)

1. Create a blank Google Sheet.
2. Go to **Extensions → Apps Script**.
3. Copy [`sheethub/Code.gs`](Code.gs) into `Code.gs`.
4. Copy [`sheethub/index.html`](index.html) into `index.html` (Files `+` -> HTML).
5. Run `setup()` once in the script editor. This auto-creates all 8 tabs, sets up bold frozen headers, and seeds sample repos (`sncf/hello-web`), sample issues, and MRs.
6. Click **Deploy → New deployment → Web app** (Execute as: *Me*, Who has access: *Anyone*).
7. Copy the `/exec` URL.

### 2. Local Testing (Offline Mock Server)

You don't need a Google account to test SheetHub locally:

```bash
# Start the local in-memory SheetHub server
node hack/local-sheethub.js
```
Open **`http://localhost:8788`** in your browser to view the GitLab-style Web UI.

Run the automated test suite:
```bash
node hack/test-sheethub.js
```

---

## CLI Reference (`shctl`)

Configure endpoint:
```bash
cat > .shctl.env <<EOF
SHEETHUB_URL=http://localhost:8788/exec
TOKEN=CHANGE_ME_super_secret
EOF
chmod +x shctl
```

Drive SheetHub from your terminal:

```bash
# List repositories
./shctl repo list

# Query issues
./shctl issue list sncf/hello-web

# Create an issue
./shctl issue create sncf/hello-web "Scale to 10 replicas" "Traffic increase expected"

# Query Merge Requests
./shctl mr list sncf/hello-web

# Inspect an MR and its manifest diff
./shctl mr view 1 sncf/hello-web

# Merge an MR
./shctl mr merge mr-001

# Fetch raw manifest file from the Files tab
./shctl file get sncf/hello-web app.json

# Guided CLI Tour
./shctl tour
```

---

## GitOps Integration with Sheetlux CD

Sync manifests directly from SheetHub into the Sheeternetes deployment directory:

```bash
./sheethub/sheetlux-sync.sh sncf/hello-web ./gitops
./sheetlux ./gitops
```

---

## License

[Apache License 2.0](../LICENSE).
