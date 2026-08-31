# Sheeternetes Roadmap

> Sheeternetes is an enterprise-grade joke that reconciles. The roadmap is also a
> joke, but — like the control plane — it is a joke you can actually run. Items ship
> when they ship. Time has no meaning in the spreadsheet.

Every item below has a **tracking issue** tagged [`good first issue`](https://github.com/tym83/sheeternetes/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).
Pick one, open a PR, and get yourself into the credential registry with something more
than belief. Contributions reconcile.

Status legend: 🟢 shipped · 🟡 in progress · ⚪ planned · 💭 idea

## Flagship

### ⚪ Cozystack managed application · [#7](https://github.com/tym83/sheeternetes/issues/7)
Package Sheeternetes as a **Cozystack managed application** — a Helm chart delivered
as a FluxCD `HelmRelease`, installable from the Cozystack marketplace into any tenant.
Deploy a spreadsheet-native control plane the same way you'd deploy Postgres or Redis.
The post-Kubernetes era, now Kubernetes-native.

- Helm chart wrapping the runtime (`kubelet.sh`, control loop, Sheetlium, Sheetlux CD).
- Cozystack catalog metadata + tenant-scoped install.
- Secrets: Google service-account credentials via a `Secret`, not a cell.

## Certification

### ⚪ CSFE Professional / Expert tiers · [#8](https://github.com/tym83/sheeternetes/issues/8)
Beyond Fundamentals: **CSFE-Pro** and **CSFE-Expert**. Harder exams, re-certification
windows, and a version-gated syllabus. Same registry, richer serials, more shame.

### ⚪ Verification badge · [#9](https://github.com/tym83/sheeternetes/issues/9)
A shields.io-style SVG badge (`CSFE · SFE000001`) served from the registry, droppable
into any README or LinkedIn. Green if valid, brown if it reconciles.

## Runtime

### ⚪ skctl ↔ kubectl parity · [#10](https://github.com/tym83/sheeternetes/issues/10)
Grow `skctl` toward drop-in kubectl muscle memory: `get`, `describe`, `logs`,
`apply -f`, `-o yaml`. The joke lands harder when the reflexes are real.

### 💭 Sheetmesh · [#6](https://github.com/tym83/sheeternetes/issues/6)
Federate several spreadsheets into one mesh — services discoverable across workbooks.
A service mesh whose data plane is tab references.

### 💭 HPA = conditional formatting · [#11](https://github.com/tym83/sheeternetes/issues/11)
Horizontal autoscaling driven by a cell formula / Sheets trigger: the replica count is
a function of a cell, and conditional formatting turns red when you're out of quota.

### 💭 Disaster recovery from Sheets revision history · [#12](https://github.com/tym83/sheeternetes/issues/12)
Restore a "cluster" from Google Sheets' built-in version history. RPO measured in
Ctrl+Z. The only orchestrator with time travel out of the box.

### 💭 SheetFinOps · [#13](https://github.com/tym83/sheeternetes/issues/13)
A cost dashboard for the runtime humanity already trusts. Infrastructure spend: $0.
The whole section exists to brag about it.

## Cloud

### ⚪ Cloud connectors · [#15](https://github.com/tym83/sheeternetes/issues/15)
Run containers on **managed cloud backends**, not only local Docker hosts. A connector
implements the `kubelet.sh` contract against a cloud's REST API — the Sheet stays the
single source of truth ("Sheet-Ops" across clouds). Bearer-token clouds can be driven
straight from Apps Script (`UrlFetchApp`); AWS is best driven by a standalone agent.
Caveats: serverless backends self-manage restart/scale, Sheetlium's service DNS does not
carry over, and credentials live in a `Secret`, never a cell.

- 🟢 easy MVPs: [DigitalOcean](https://github.com/tym83/sheeternetes/issues/16) ·
  [GCP Cloud Run](https://github.com/tym83/sheeternetes/issues/17) ·
  [Yandex Serverless Containers](https://github.com/tym83/sheeternetes/issues/18)
- 🟡 medium: [Azure Container Instances](https://github.com/tym83/sheeternetes/issues/19)
- 🔴 hard (SigV4): [AWS ECS/Fargate](https://github.com/tym83/sheeternetes/issues/20)

## How to influence the roadmap
Browse the [`good first issue` proposals](https://github.com/tym83/sheeternetes/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
and open a PR against one. Or open a new issue. Or don't — it reconciles either way.
