# Sheeternetes

**A container orchestrator whose control plane is a Google Sheet.**

Real Docker containers, on real hosts, scheduled and self-healed by a control
loop written in Google Apps Script — with a spreadsheet as the datastore.

It started as a bar-bet-grade joke ("can you build a container orchestrator in
Excel?") and turned out to be a surprisingly faithful teaching model, because
Kubernetes and a spreadsheet are the same kind of thing underneath: a
**declarative, desired-state engine that reconciles reality toward what you
declared.**

```
  You edit the "Deployments" tab   ──►  desired state (like etcd)
  Apps Script reconcile loop       ──►  scheduler + controllers (like kube-controller-manager)
  Apps Script Web App endpoint     ──►  apiserver
  kubelet.sh on each Docker host   ──►  kubelet
  Docker containers                ──►  pods
```

> This is an educational toy. Do not run production on a spreadsheet. (If you do,
> please film it.)

## How it maps to Kubernetes

| Kubernetes | Sheeternetes |
| --- | --- |
| etcd (desired + observed state) | tabs in the Google Sheet |
| kube-apiserver | Apps Script Web App (`doGet`/`doPost`) |
| scheduler (bin-packing) | `reconcile()` picks the Ready node with most free CPU |
| controllers / reconcile loop | `reconcile()` on every heartbeat + a 1-minute timer |
| kubelet | `kubelet.sh` polling loop on each host |
| kubectl | `skctl` |
| pod | a labeled Docker container (`sk_<pod>`) |

The control loop is **heartbeat-driven**: each kubelet reports the containers it
runs, the apiserver runs a reconcile, and answers with the exact set of pods
that node should be running. The node converges. That's the whole system.

## The Sheet (four tabs)

- **Deployments** — *you edit this.* `name, image, replicas, cpu_req (millicores), mem_req (MiB), command`
- **Nodes** — written by kubelets: capacity, usage, `status`, `last_heartbeat`
- **Pods** — written by the control loop: `phase` (Pending → Scheduled → Running → Terminating → Deleted), which node, container id
- **Events** — an audit log of scheduling / scaling / eviction decisions

## Quickstart

### 1. Control plane (Apps Script)

1. Create a Google Sheet.
2. **Extensions → Apps Script**, paste [`Code.gs`](Code.gs).
3. Set `TOKEN` at the top to something secret.
4. Run `setup()` once (grant permissions). It creates the tabs, two sample
   deployments, and installs the 1-minute reconcile trigger.
5. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access:
   Anyone*. Copy the `/exec` URL.

### 2. CLI

```bash
cat > .skctl.env <<EOF
WEBAPP_URL=https://script.google.com/macros/s/XXXX/exec
TOKEN=your-secret
EOF
chmod +x skctl kubelet.sh local-cluster.sh lab/tour.sh
```

### 3. Nodes

On any Docker host (needs `bash curl jq docker`):

```bash
WEBAPP_URL=... TOKEN=... NODE_NAME=node-a CPU_TOTAL=4000 MEM_TOTAL=8192 ./kubelet.sh
```

Or fake a 3-node cluster on one machine:

```bash
./local-cluster.sh          # starts node-a/b/c as background kubelets
./skctl get nodes
```

### 4. Drive it

```bash
./skctl get nodes
./skctl apply lab/hello-web.json
./skctl get pods
./skctl scale whoami 6
./skctl get events
```

## The lab

Pre-baked things to deploy and watch (open the Sheet side-by-side):

| File | What it shows |
| --- | --- |
| `lab/hello-web.json` | 3× `traefik/whoami` spread across nodes — the basics |
| `lab/clock.json` | custom `command` flowing Sheet → kubelet → `docker run` |
| `lab/microservices.json` | a small service "city" filling nodes by free CPU (bin-packing) |
| `lab/overcommit.json` | asks for more CPU than exists — watch pods stay **Unschedulable** |

Guided demo (deploy → scale → self-heal → clean up):

```bash
./skctl tour
```

To see **self-healing**: with the tour running, stop one kubelet
(`./local-cluster.sh stop` or Ctrl-C a single node). After ~90s its node goes
`NotReady`, and the control loop reschedules its pods onto the survivors — just
like the real thing.

## Limitations (a.k.a. "it's a spreadsheet")

- No restart-on-crash for containers that exit on their own (pods are assumed
  long-running); the model reschedules on *node* failure, not container exit.
- Apps Script has execution-time and quota limits; this scales to a demo, not a
  datacenter.
- Auth is a single shared token. It is a toy. Treat the Web App URL as a secret.

## License

[Apache License 2.0](LICENSE).
