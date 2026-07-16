---
name: langfuse-previews
description: >
  Disposable per-PR preview environments for langfuse/langfuse. A same-repo PR
  auto-builds a full Langfuse stack reachable at pr-N.preview.langfuse.com.
  Use when spinning up or using a PR preview, logging into one, working out why
  a preview did not come up (built but the URL 404s, ImagePullBackOff, pods
  stuck Pending), reading web / worker / ClickHouse logs or otherwise debugging
  a preview with kubectl, waking a preview that went to sleep off-hours, or
  getting preview deploy or cluster access. Synthetic data only.
---

# Langfuse PR Previews

Every same-repo PR on `langfuse/langfuse` can get a disposable, full-stack
Langfuse environment at `https://pr-<N>.preview.langfuse.com`. Opening the PR
builds a web + worker image; if your GitHub login is on the deploy allowlist,
Argo CD (run from the private `langfuse/infrastructure` repo) deploys it.
Pushing updates it; closing the PR tears it down.

> **⚠️ Synthetic data only.** The login is shared and the URL is public — never
> put a real credential, API key, or customer data into a preview. Treat every
> preview as throwaway.

## Access model (two independent gates)

- **Build — any write-access member.** Every *same-repo* PR is auto-labeled
  `preview` on open and builds a web + worker image. The gate is **write (push)
  access** — opening a same-repo PR requires it. **Fork PRs never build or
  deploy** (a public-repo PR can't mint the cloud credential).
- **Deploy — a per-author allowlist.** A preview only gets a live URL if the PR
  **author is on the deploy allowlist** (the `author` selector in the Argo CD
  ApplicationSet, `langfuse/infrastructure`). Not on it? Your PR still builds,
  but the URL 404s — add yourself (see [Getting access](#getting-access)).

## Using a preview

- **Spin up** — open a same-repo PR. It's auto-labeled and builds (~5 min); a
  bot comment then posts the preview URL and login, and a GitHub deployment
  (environment `pr-<n>`) gives the PR a **View deployment** button. No manual
  step, no label to add.
- **Log in** — use the credentials in the **bot's PR comment** (the source of
  truth). The demo project's shared seed identity is `demo@langfuse.com` /
  `password`, with API keys `pk-lf-1234567890` / `sk-lf-1234567890` — shared and
  synthetic, so never treat a preview as private.
- **Update** — push to the PR; it rebuilds and rolls to the new image (~5 min,
  **same URL, data preserved**). A brief `ImagePullBackOff` during the rebuild
  is normal and self-heals.
- **Tear down** — close the PR, or remove the `preview` label; namespace, data,
  and DNS record are all deleted. **Merging closes the PR, so it tears down too.**

## Good to know

- **Off-hours sleep.** Previews run **Mon–Fri 08:00–24:00 Europe/Berlin**; nights
  and weekends they scale to zero and *stay there* (schedule-driven — a request
  does **not** wake them). To use one off-hours, wake it (needs cluster access):
  `kubectl annotate ns langfuse-pr-<N> downscaler/force-uptime=true --overwrite`
  — replicas return in ~60s, ready in ~3–5 min; undo later with the trailing-`-`
  form (`downscaler/force-uptime-`) so it sleeps again on schedule.
- **Capacity.** A limited number of previews run at once; if the cluster is full,
  a new one's pods sit `Pending` until an old preview is closed.
- **Disposable data.** Closing a PR destroys its database; reopening gives a
  **fresh** environment, not the old one.
- **Forks can't preview.** External / fork PRs never build or deploy.

## Debug a preview

Needs cluster access (see [Getting access](#getting-access)). Set your PR's
namespace once — the chart names everything `<namespace>-<component>`, so the
rest derives from it:

```bash
NS=langfuse-pr-<N>              # e.g. langfuse-pr-42
```

**What's running / healthy?**
```bash
kubectl -n $NS get pods                       # web, worker, postgresql, clickhouse, redis, minio
kubectl -n $NS get pods,svc,ingress,pvc       # fuller picture
```
Nothing listed? It's probably asleep off-hours — wake it (below).

**App logs — usually the first stop:**
```bash
kubectl -n $NS logs deploy/$NS-web    --tail=200 -f    # web: UI / API server
kubectl -n $NS logs deploy/$NS-worker --tail=200 -f    # worker: ingestion + async jobs
```
Drop `-f` for a one-shot dump; `--since=15m` bounds by time; `-p` / `--previous`
shows a **crashed** container's logs after a restart (use for `CrashLoopBackOff`).

**Datastore logs** (single-node; get exact pod names from `get pods`):
```bash
kubectl -n $NS logs sts/$NS-postgresql --tail=100
CH=$(kubectl -n $NS get pods -o name | grep clickhouse | head -1)
kubectl -n $NS logs "$CH" --tail=100          # single-node ClickHouse — watch for OOM / restarts
```

**A pod won't start (Pending / CrashLoopBackOff / ImagePullBackOff):**
```bash
kubectl -n $NS describe pod <pod>             # the Events list at the bottom is the reason
kubectl -n $NS get events --sort-by=.lastTimestamp | tail -30
```

**Shell in / restart / reach it without the ALB:**
```bash
kubectl -n $NS exec -it deploy/$NS-web -- sh          # inspect env, curl internal services
kubectl -n $NS rollout restart deploy/$NS-web         # re-roll after a fix
kubectl -n $NS port-forward deploy/$NS-web 3000:3000  # hit localhost:3000, bypassing the ALB
```

**Wake a sleeping preview** (off-hours):
```bash
kubectl annotate ns $NS downscaler/force-uptime=true --overwrite   # replicas back in ~60s, ready ~3–5 min
kubectl annotate ns $NS downscaler/force-uptime-                   # undo later so it sleeps on schedule
```

### Symptom → fix
| Symptom | Likely cause / fix |
|---|---|
| 🟢 build comment posted, but the URL 404s | PR author not on the **deploy allowlist** — the image built, nothing deployed. Add yourself (see Getting access). |
| URL not ready right after building | Build still finishing (~5 min) or a transient `ImagePullBackOff` — it self-heals. |
| Unresponsive at night / on a weekend | Asleep off-hours — wake it (above). |
| Pods `Pending`, never schedule | Cluster at its preview capacity cap — close an old preview. |
| ClickHouse pod restarting / OOM | Single-node ClickHouse is the fragile piece — check its logs first. |

## Getting access

- **Deploy access — self-serve.** Add your own GitHub login to the `author`
  selector in `k8s/preview/bootstrap/applicationset.yaml` (repo
  `langfuse/infrastructure`), open a PR, and merge to `main`. Argo re-syncs and
  your labeled PRs deploy — no admin needed.
- **Cluster access — needs an admin** (only to debug with `kubectl`, not to
  *use* a preview). Ask an admin to add you to the preview-cluster role in AWS
  IAM Identity Center. Then set up local access — the `~/.aws/config` profile
  block and its exact values (AWS account id, SSO start URL, cluster name,
  region) are in the internal Langfuse doc:
  https://linear.app/langfuse/document/connect-to-aws-instances-aurora-redis-from-local-machine-896fe46ff797
  1. Open `~/.aws/config` and add the `[sso-session langfuse]` + `[profile preview]`
     blocks from that doc (keep any `[sso-session langfuse]` you already have).
  2. `aws sso login --profile preview`
  3. `aws eks update-kubeconfig --name <cluster> --region <region> --profile preview`
     (name + region are in the doc; no `--role-arn` — the role has its own EKS
     access entry).

---

Preview internals — the EKS cluster, Argo CD ApplicationSet, Helm chart, and the
admin onboarding runbook — live in the private `langfuse/infrastructure` repo
(`k8s/preview/`). Change the preview *system* there, not here.
