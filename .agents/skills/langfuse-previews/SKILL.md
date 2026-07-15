---
name: langfuse-previews
description: >
  Disposable per-PR preview environments for langfuse/langfuse. A same-repo PR
  auto-builds a full Langfuse stack reachable at pr-<N>.preview.langfuse.com.
  Use when spinning up or using a PR preview, working out why a preview did not
  come up (built but the URL 404s, ImagePullBackOff, pods stuck Pending), waking
  a preview that went to sleep off-hours, debugging web / worker / ClickHouse in
  a preview, or getting preview deploy or cluster access. Synthetic data only.
---

# Langfuse PR Previews

Every same-repo PR on `langfuse/langfuse` can get a disposable, full-stack
Langfuse environment at `https://pr-<N>.preview.langfuse.com`. Opening the PR
builds a web + worker image; if your GitHub login is on the deploy allowlist,
Argo CD (run from the private `langfuse/infrastructure` repo) deploys it.
Pushing updates it; closing the PR tears it down.

> **Synthetic data only.** The login is shared and the URL is public — never put
> a real credential, API key, or customer data into a preview.

## Access model (two independent gates)

- **Build — any write-access member.** Every *same-repo* PR is auto-labeled
  `preview` on open and builds a web + worker image. The gate is **write (push)
  access** — opening a same-repo PR requires it. **Fork PRs never build or
  deploy** (a public-repo PR can't mint the cloud credential).
- **Deploy — a per-author allowlist.** A preview only gets a live URL if the PR
  **author is on the deploy allowlist** (the Argo CD ApplicationSet in
  `langfuse/infrastructure`). Not on it? Your PR still builds, but the URL 404s.
  Ask an admin to add you.

## Using a preview

- **Spin up:** open a same-repo PR. It's auto-labeled and builds (~5 min); a bot
  comment then posts the preview URL and the (synthetic) login. No manual step.
- **Update:** push to the PR — it rebuilds and rolls to the new image (~5 min,
  **same URL, data preserved**). A brief `ImagePullBackOff` during the rebuild
  is normal and self-heals.
- **Tear down:** close the PR, or remove the `preview` label — namespace, data,
  and DNS record are all deleted. **Merging closes the PR, so it tears down too.**
- **Log in:** use the credentials in the bot's PR comment (the source of truth).

## Debug a preview (needs cluster access — see below)

```bash
NS=langfuse-pr-<N>
kubectl -n $NS get pods                                   # web, worker, postgresql, clickhouse, redis, minio
kubectl -n $NS logs deploy/$NS-web    --tail=200 [-f|-p]  # UI / API   (-p = previous/crashed instance)
kubectl -n $NS logs deploy/$NS-worker --tail=200 [-f|-p]  # ingestion / async jobs
kubectl -n $NS describe pod <pod>
kubectl -n $NS get events --sort-by=.lastTimestamp | tail -30
```
- **Nothing listed, or unreachable at night / on a weekend** → scaled to zero
  off-hours (Mon–Fri 08:00–24:00 Europe/Berlin; schedule-driven, *not* woken by
  requests). Wake it:
  `kubectl annotate ns $NS downscaler/force-uptime=true --overwrite`
  (undo later with the trailing-`-` form: `downscaler/force-uptime-`).
- **`ImagePullBackOff` on web / worker** → image still building (~5 min), or the
  PR author isn't on the deploy allowlist.
- **Pods `Pending`, never schedule** → the cluster is at its preview capacity
  cap; close an old preview to free a slot.
- **ClickHouse pod restarting / OOM** → single-node ClickHouse is the fragile
  piece; check its logs first.

## Getting access

Both are granted by a Langfuse admin — nothing self-serve:

- **Deploy access:** ask an admin to add your GitHub login to the preview deploy
  allowlist (the ApplicationSet in `langfuse/infrastructure`).
- **Cluster access** (only needed to debug with `kubectl`, not to *use* a
  preview): ask an admin to add you to the preview-cluster role in AWS IAM
  Identity Center, then set up your `~/.aws/config` SSO profile following the
  internal Langfuse "connect to AWS from your local machine" doc (Linear).

---

Preview internals — the EKS cluster, Argo CD ApplicationSet, Helm chart, and the
admin onboarding runbook — live in the private `langfuse/infrastructure` repo
(`k8s/preview/`). Change the preview *system* there, not here.
