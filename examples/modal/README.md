# Langfuse + AI Gateway on Modal (Ephemeral Sandbox PoC)

A minimal, reproducible proof of concept that runs the complete Langfuse stack (`langfuse-web`, `langfuse-worker`, `langfuse-ai-gateway`, Postgres, ClickHouse, Redis, and MinIO) inside a single ephemeral [Modal Sandbox](https://modal.com/docs/guide/sandbox) using [Sandbox Sidecars](https://modal.com/docs/guide/sandbox-sidecars) and published container images — with **zero external databases or cloud accounts**.

> **Scope note:** This is an ephemeral PoC/demo setup (up to 24 hours per Sandbox), not a production deployment architecture. See [What does not fit Modal well](#what-does-not-fit-modal-well) below.

## Architecture

```text
Internet (HTTPS via Modal encrypted tunnels)
 ├──► https://<tunnel-3000>.modal.host ──┐
 ├──► https://<tunnel-3031>.modal.host ──┼──► main Sandbox: caddy:2-alpine (no secrets)
 └──► https://<tunnel-9090>.modal.host ──┘      │   :3000 -> http://web:3000 (X-Forwarded-Proto: https)
                                                 │   :3031 -> http://ai-gateway:3031 (SSE flush -1)
                                                 │   :9090 -> http://minio:9000
                                                 │
         ┌───────────────────────────────────────┴─── host-local Sandbox bridge ───┐
         ▼                                       ▼                                  ▼
   [web] :3000  ◄── http://web:3000 ──── [ai-gateway] :3031                  [worker] :3030
   langfuse:4        (/resolve + OTLP)    ai-gateway:4                        langfuse-worker:4
         │                                       │                                  │
         └───────────────┬───────────────────────┴──────────────────────────────────┘
                         ▼  (outbound_cidr_allowlist=[] on all 4 data sidecars)
        [postgres] :5432   [clickhouse] :8123/:9000   [redis] :6379   [minio] :9000
        postgres:17        clickhouse-server:26.3.62.3 redis:7        chainguard/minio
```

### How it is wired

- **Main Sandbox (`caddy:2-alpine`):** Exposes ports `3000` (Langfuse UI), `3031` (AI Gateway), and `9090` (MinIO presigned URLs) via Modal's `encrypted_ports`. Starting Caddy first lets `modal_app.py` obtain the tunnel URLs *before* starting `web`, so `NEXTAUTH_URL`, `LANGFUSE_AI_GATEWAY_PUBLIC_URL`, and `LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT` match the live HTTPS origins immediately. Caddy receives **no Modal Secrets**.
- **7 isolated Sidecars (published images):** Every service runs from its published registry image (`docker.langfuse.com/langfuse/{langfuse,langfuse-worker,ai-gateway}:4`, `postgres:17`, `clickhouse/clickhouse-server:26.3.62.3`, `redis:7`, `cgr.dev/chainguard/minio`) on the Sandbox's host-local bridge network (`/etc/hosts` resolves `postgres`, `clickhouse`, `redis`, `minio`, `web`, `worker`, `ai-gateway`).
- **Gateway ↔ Langfuse:** `ai-gateway` calls `http://web:3000` directly over the private local bridge (`LANGFUSE_AI_GATEWAY_ALLOW_HTTP_WEB_URL=true` is safe because traffic never leaves the host-local bridge) and connects to `redis://redis:6379` for spend budgets.
- **Secrets:** All runtime secrets (`NEXTAUTH_SECRET`, `SALT`, `ENCRYPTION_KEY`, DB/ClickHouse/Redis/MinIO passwords, `LANGFUSE_AI_GATEWAY_SERVICE_KEY`, an ES256 P-256 `LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY`, and the pre-provisioned `LANGFUSE_INIT_*` login and project API keys) live exclusively in a Modal Secret (`langfuse-modal-poc`), never in code.
- **Data sidecar egress lock:** Postgres, ClickHouse, Redis, and MinIO run with `outbound_cidr_allowlist=[]` (zero outbound internet access while remaining reachable on the local bridge).

## Prerequisites

1. Python 3.11+ and `openssl` (used by `init-secret` to generate the ES256 P-256 key).
2. Install the Modal SDK:
   ```bash
   pip install -r examples/modal/requirements.txt
   ```
3. Authenticate with Modal via environment variables (recommended for CI/Cloud Agents) or `modal setup`:
   ```bash
   export MODAL_TOKEN_ID="ak-..."
   export MODAL_TOKEN_SECRET="as-..."
   ```

## Quickstart

### 1. Create the Modal Secret (once)

Generates cryptographically random credentials and stores them directly in Modal Secret `langfuse-modal-poc` without printing them:

```bash
python examples/modal/modal_app.py init-secret
```

### 2. Start the ephemeral stack

```bash
python examples/modal/modal_app.py up
```

Useful flags:

- `--runtime vm --memory 10240` — switch from gVisor to Modal's full Linux VM runtime (auto-computes `vm_sidecar_memory_reserve_mib` and per-sidecar memory shares) if ClickHouse or Postgres hits a gVisor syscall limitation.
- `--timeout 14400` — set Sandbox lifetime in seconds (default 2h; Modal hard cap is 86400s / 24h).
- `--langfuse-tag 4` / `--gateway-tag 4` — pin image tags (must be `> 4.75.0` for AI Gateway UI support).
- `--attach` — stay attached and terminate the Sandbox on Ctrl+C.

### 3. Verify health and gateway wiring

```bash
python examples/modal/modal_app.py smoke
```

This checks:

- `GET <Langfuse UI>/api/public/health` → `200`
- `GET <Langfuse UI>/auth/sign-in` → `200` (Langfuse UI reachable over HTTPS via Caddy)
- `GET <AI Gateway>/health` → `200 {"status":"ok"}`
- `GET <AI Gateway>/ready` → `200 {"status":"ready"}` (proves control-plane wiring to `langfuse-web`)
- `GET <MinIO S3>/minio/health/live` → `200`
- `GET http://worker:3030/api/health` (inside the Sandbox bridge) → `200`

### 4. Try an AI Gateway request end-to-end

1. Open the printed **Langfuse UI** URL (`https://<tunnel-3000>.modal.host`) and either sign up or log in with the pre-provisioned admin user (its credentials are stored only in Modal Secret `langfuse-modal-poc` — read them locally with the Modal CLI):
   ```bash
   modal shell --secret langfuse-modal-poc --no-pty -c \
     'printf "Email: %s\nPassword: %s\n" "$LANGFUSE_INIT_USER_EMAIL" "$LANGFUSE_INIT_USER_PASSWORD"'
   ```
2. Open **AI Gateway** in the organization settings:
   - Configure ingestion to record into your project (e.g. `Modal PoC Project`).
   - Add an upstream provider connection (e.g. OpenAI or Anthropic) with your provider API key.
   - Create an AI Gateway key. The UI automatically displays the live Modal **AI Gateway** URL (`LANGFUSE_AI_GATEWAY_PUBLIC_URL`).
3. Send a request through the gateway (use `<connection-name>:<model>` to target a specific connection, or a bare OpenAI/Anthropic model name like `gpt-4o-mini` for implicit routing):
   ```bash
   curl -sS "<AI_GATEWAY_URL>/openai/v1/chat/completions" \
     -H "Authorization: Bearer <YOUR_GATEWAY_KEY>" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "gpt-4o-mini",
       "messages": [{"role": "user", "content": "Say hello from Modal"}]
     }'
   ```
4. Reload **Traces** / **Observations** in the Langfuse UI — the gateway exports the OTLP generation span to `web`, which enqueues it in `redis`/`minio`, and `worker` writes it into `clickhouse`.

### 5. Stop the stack (important for billing)

```bash
python examples/modal/modal_app.py stop
```

## Local offline validation

To verify wiring, secret generation, Caddyfile rendering, VM memory partitioning, and CLI orchestration without Modal credentials:

```bash
python3 -m unittest discover -s examples/modal -v
```

## What does not fit Modal well

Running the entire Langfuse stack on Modal highlights clear platform boundaries:

| Area | Why it is a poor fit on Modal |
| --- | --- |
| **Stateful databases (Postgres, Redis, MinIO)** | Container filesystems are ephemeral and wiped on Sandbox termination. [Modal Volumes](https://modal.com/docs/guide/volumes) (v1 & v2) are object-backed distributed filesystems with last-write-wins conflict semantics, no POSIX file locking, and no real block-device `statfs` reporting — unsafe for live Postgres WAL, Redis AOF/RDB, or multi-writer object stores. |
| **ClickHouse** | ClickHouse expects durable local block storage, sustained RAM for MergeTree merges, and standard Linux kernel syscalls. Under ephemeral Sandboxes, all trace/analytics data disappears on restart; under gVisor, certain kernel calls can require switching to `--runtime vm`. |
| **24-hour Sandbox cap & ephemeral URLs** | [Modal Sandboxes](https://modal.com/docs/guide/sandbox) enforce a hard **24-hour** maximum timeout, and tunnel hostnames (`*.modal.host`) regenerate on every launch — breaking persistent bookmarks, OAuth callbacks, and SDK endpoints. |
| **Long-running worker (`langfuse-worker`)** | BullMQ workers continuously poll Redis rather than handling on-demand HTTP requests. They cannot scale to zero on Modal: either they stay up inside a Sandbox (24h cap, 3x rate) or must be pinned at `min_containers=1` on a Modal Web Function (paying idle compute 24/7 and still facing preemptions with a 30s exit grace period). |
| **Cold starts & boot time** | First launch pulls 8 registry images (~2–4 min); every new Sandbox initializes empty Postgres/ClickHouse instances and runs Langfuse migrations (~1–2 min). Even in a hybrid `@modal.web_server` deployment, Next.js has multi-second cold starts and Modal enforces a [150-second HTTP request timeout](https://modal.com/docs/guide/webhook-timeouts) before issuing a `303` redirect. |
| **Cost for steady-state workloads** | [Modal Sandboxes](https://modal.com/pricing) bill at **3x non-preemptible rates** (`$0.00003942`/core/s + `$0.00000667`/GiB/s; 1 physical core = 2 vCPU). At 4 cores + 8 GiB, this Sandbox costs **~$0.76/hr** (~$1.50 for a 2-hour demo, which fits comfortably in Starter's $30/mo credits, but would be ~$550/mo if kept up continuously). |
| **Experimental Sidecars API** | [Sandbox Sidecars](https://modal.com/docs/guide/sandbox-sidecars) (`_experimental_sidecars`) are experimental, do not stream Sidecar entrypoint stdout/stderr directly, and require explicit memory reserves on the `vm` runtime. |

### Production alternative

For a persistent deployment, keep stateful data in managed services (Neon/RDS Postgres, ClickHouse Cloud, Upstash/ElastiCache Redis, AWS S3/R2) and run `langfuse-web`, `langfuse-worker`, and `langfuse-ai-gateway` on Kubernetes (Helm), ECS, or — if you still want Modal for stateless burst compute — Modal `@modal.web_server` Functions backed by those managed data services.
