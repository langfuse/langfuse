# Langfuse + AI Gateway on Modal (Scalable `@app.server()` + Swappable Data Tier)

Runs `langfuse-web`, `langfuse-ai-gateway`, and `langfuse-worker` as independently scalable [Modal Servers](https://modal.com/docs/guide/servers) (`examples/modal/modal_servers.py`) from published container images, backed by a **swappable data tier**:

- **Zero-infra PoC mode (default):** an ephemeral `langfuse-db` [Modal Sandbox](https://modal.com/docs/guide/sandbox) hosting Postgres, ClickHouse, Redis, and MinIO as 4 isolated [Sandbox Sidecars](https://modal.com/docs/guide/sandbox-sidecars).
- **Production / managed DB mode (`--external-db`):** skip the DB Sandbox and point Modal Secret `langfuse-modal-endpoints` at managed Postgres (Neon/RDS), ClickHouse Cloud, Redis (Upstash/ElastiCache), and S3/R2 — **zero code changes** to `modal_servers.py`.

## Architecture

```text
Internet (stable HTTPS via Modal Servers)
 ├──► https://<workspace>--langfuse-ai-gateway-poc-langfuseweb.modal.run
 │       └─► @app.server() LangfuseWeb       (langfuse:4, autoscales 1..N on concurrency)
 ├──► https://<workspace>--langfuse-ai-gateway-poc-langfuseaigateway.modal.run
 │       └─► @app.server() LangfuseAiGateway (ai-gateway:4, autoscales 1..N, HTTPS -> Web)
 └──► (private, Modal proxy auth required)
         └─► @app.server() LangfuseWorker    (langfuse-worker:4, scaled via min_containers=N)
         └─► @app.function() run_migrations  (one-off Postgres + ClickHouse migrations)
                                │
                                │  endpoints from Modal Secret `langfuse-modal-endpoints`
                                │  credentials from Modal Secret `langfuse-modal-poc`
                                ▼
       ┌──────────────────────────────────────────────────────────────────────┐
       │  Swappable data tier:                                                │
       │    • PoC default: ephemeral `langfuse-db` Sandbox                    │
       │        nginx:1-alpine TCP/HTTP proxy                                 │
       │          ├─► [postgres]   :5432  (postgres:17, no egress)            │
       │          ├─► [clickhouse] :8123 / :9000 (clickhouse-server:26.3.62.3)│
       │          ├─► [redis]      :6379  (redis:7, no egress)                │
       │          └─► [minio]      :9000  (chainguard/minio, no egress)       │
       │    • Production best practice: managed Postgres, ClickHouse Cloud,   │
       │      managed Redis, and AWS S3 / Cloudflare R2                       │
       └──────────────────────────────────────────────────────────────────────┘
```

### Why this split works well
- **Independently scalable app tier:** `LangfuseWeb` and `LangfuseAiGateway` autoscale on concurrent HTTP requests at regular Modal Server rates (1x, not Sandbox 3x), with native Modal logs and stable HTTPS URLs.
- **No migration races on scale-up:** `LangfuseWeb` runs with `LANGFUSE_AUTO_POSTGRES_MIGRATION_DISABLED=true` and `LANGFUSE_AUTO_CLICKHOUSE_MIGRATION_DISABLED=true`. Schema migrations run once via the dedicated `run_migrations` Modal Function.
- **Private worker pool:** `LangfuseWorker` runs as an authenticated `@app.server(port=3030, unauthenticated=False)` so Modal health-checks port `3030`, keeps `min_containers=N` BullMQ pollers alive continuously, and lets you scale workers live via `Server.autoscaler.update()`.
- **Clean swap to managed DBs:** Because `modal_servers.py` reads all hosts/URLs from Modal Secret `langfuse-modal-endpoints` and all passwords/keys from `langfuse-modal-poc`, replacing the ephemeral DB Sandbox with outside managed databases requires zero code changes.

## Prerequisites

1. Python 3.11+ and `openssl` (used by `init-secret` to generate the ES256 P-256 key).
2. Install dependencies:
   ```bash
   pip install -r examples/modal/requirements.txt
   ```
3. Authenticate with Modal via environment variables or `modal setup`:
   ```bash
   export MODAL_TOKEN_ID="ak-..."
   export MODAL_TOKEN_SECRET="as-..."
   ```

## Quickstart (PoC with ephemeral DB Sandbox)

### 1. Create the credentials Secret (once)

Generates cryptographically random credentials (DB/Redis/MinIO passwords, `NEXTAUTH_SECRET`, `SALT`, `ENCRYPTION_KEY`, `LANGFUSE_AI_GATEWAY_SERVICE_KEY`, an ES256 P-256 `LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY`, and pre-provisioned `LANGFUSE_INIT_*` login + project API keys) and stores them exclusively in Modal Secret `langfuse-modal-poc` without printing them:

```bash
python examples/modal/modal_app.py init-secret
```

### 2. Start the DB Sandbox, run migrations, and deploy Modal Servers

```bash
python examples/modal/modal_app.py up
```

Useful flags:
- `--web 1 --workers 2 --gateways 2` — set initial `min_containers` per service.
- `--max-web 4 --max-workers 4 --max-gateways 10` — set autoscaler ceilings.
- `--routing-region eu-west` — pick the Modal Server proxy region closest to your clients (`us-east`, `us-west`, `eu-west`, etc.).
- `--timeout 14400` — set ephemeral DB Sandbox lifetime in seconds (default 2h; Modal hard cap is 86400s / 24h).
- `--runtime vm --db-memory 8192` — run the DB Sandbox on Modal's full Linux VM runtime instead of gVisor.
- `--reuse-db` — redeploy `modal_servers.py` against an already-running `langfuse-db` Sandbox.

### 3. Verify health and gateway wiring

```bash
python examples/modal/modal_app.py smoke
```

This checks:
- `GET <Langfuse UI>/api/public/health` → `200`
- `GET <Langfuse UI>/auth/sign-in` → `200`
- `GET <AI Gateway>/health` → `200 {"status":"ok"}`
- `GET <AI Gateway>/ready` → `200 {"status":"ready"}` (proves HTTPS control-plane wiring to `LangfuseWeb`)
- `GET <DB Sandbox ClickHouse>/ping` → `200` and `GET <DB Sandbox MinIO>/minio/health/live` → `200` (when the DB Sandbox is running)

### 4. Scale live (no redeploy)

```bash
python examples/modal/modal_app.py scale --workers 2 --gateways 3 --web 1
```

Inspect current Server URLs, autoscaler settings, and DB Sandbox status:

```bash
python examples/modal/modal_app.py status
```

### 5. Try an AI Gateway request end-to-end

1. Open the printed **Langfuse UI** URL and log in with the pre-provisioned admin user (credentials live only in Modal Secret `langfuse-modal-poc` — read them locally with the Modal CLI):
   ```bash
   modal shell --secret langfuse-modal-poc --no-pty -c \
     'printf "Email: %s\nPassword: %s\n" "$LANGFUSE_INIT_USER_EMAIL" "$LANGFUSE_INIT_USER_PASSWORD"'
   ```
2. Open **AI Gateway** in organization settings (`Modal PoC Org`):
   - Set ingestion to `Modal PoC Project` (`FULL` or `USAGE`).
   - Add an upstream provider connection (e.g. OpenAI or Anthropic) with your provider API key.
   - Create an AI Gateway key. The UI automatically shows the live Modal **AI Gateway** URL (`LANGFUSE_AI_GATEWAY_PUBLIC_URL`).
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
4. Reload **Observations** / **Traces** in the Langfuse UI (or query `GET <Langfuse UI>/api/public/v2/observations` — Langfuse v4 defaults to `events_only` mode).

### 6. Stop everything (important for billing)

```bash
python examples/modal/modal_app.py stop
```

Pass `--db-only` to tear down only the ephemeral DB Sandbox, or `--app-only` to stop only the Modal Servers.

## Moving to outside managed databases (recommended beyond PoC)

The ephemeral `langfuse-db` Sandbox is strictly for demos and load tests: its disk is wiped when stopped, it has a 24-hour hard timeout, and its DB ports are exposed via Modal tunnels (because `Sandbox.create` does not support `i6pn`).

For anything persistent, replace the DB Sandbox with managed services (e.g. Neon/RDS Postgres, ClickHouse Cloud, Upstash/ElastiCache Redis, AWS S3/Cloudflare R2) without changing `examples/modal/modal_servers.py`:

1. Stop the ephemeral DB Sandbox (if running):
   ```bash
   python examples/modal/modal_app.py stop --db-only
   ```
2. Put your managed database/storage passwords in Modal Secret `langfuse-modal-poc` (`DATABASE_PASSWORD`, `CLICKHOUSE_PASSWORD`, `REDIS_AUTH`, `LANGFUSE_AI_GATEWAY_REDIS_AUTH`, `LANGFUSE_S3_*_SECRET_ACCESS_KEY`) and your managed hosts/URLs in Modal Secret `langfuse-modal-endpoints`:
   - `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USERNAME`, `DATABASE_NAME`, `DATABASE_ARGS` (e.g. `sslmode=require`)
   - `CLICKHOUSE_URL` (`https://<your-clickhouse-cloud>:8443`), `CLICKHOUSE_MIGRATION_URL` (`clickhouse://<host>:9440`), `CLICKHOUSE_USER`, `CLICKHOUSE_CLUSTER_ENABLED`, `CLICKHOUSE_MIGRATION_SSL=true`
   - `REDIS_HOST`, `REDIS_PORT`, `REDIS_TLS_ENABLED=true`, `LANGFUSE_AI_GATEWAY_REDIS_URL=rediss://<host>:<port>`
   - `LANGFUSE_S3_{EVENT,MEDIA,BATCH_EXPORT}_UPLOAD_*` (bucket, region, endpoint, access key ID, force path style)
   - `NEXTAUTH_URL`, `LANGFUSE_AI_GATEWAY_PUBLIC_URL`, `LANGFUSE_AI_GATEWAY_WEB_URL` (your Modal Server URLs or custom domains)
3. Deploy and migrate without starting a DB Sandbox:
   ```bash
   python examples/modal/modal_app.py up --external-db
   ```
   (Or run `modal deploy examples/modal/modal_servers.py` and `modal run examples/modal/modal_servers.py::run_migrations` directly.)

## Local offline validation

```bash
python3 -m unittest discover -s examples/modal -v
```

## Platform tradeoffs on Modal

| Component | Fit on Modal | Notes |
| --- | --- | --- |
| **`langfuse-ai-gateway`** (`@app.server`) | Strong | Stateless Rust HTTP service; autoscales cleanly on `target_concurrency` with graceful drain (`exit_grace_period`). |
| **`langfuse-web`** (`@app.server`) | Good | Keep `min_containers >= 1` to avoid Next.js cold starts and 503s during 0→1 boot; run migrations via `run_migrations` Function. |
| **`langfuse-worker`** (`@app.server`, private) | Workable (manual scaling) | Polls Redis BullMQ rather than handling HTTP requests, so Modal's request autoscaler cannot scale it on queue depth; adjust replicas via `modal_app.py scale --workers N` (or run workers on K8s/ECS with KEDA). |
| **Postgres, ClickHouse, Redis, MinIO** (`langfuse-db` Sandbox) | PoC only | Ephemeral disk, 24h max Sandbox timeout, 3x Sandbox billing, and tunneled DB ports (no `i6pn` on Sandboxes). Move to managed DBs for persistent use. |
