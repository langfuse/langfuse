# AI Gateway service foundation

A standalone Rust HTTP process with health probes, bounded shutdown, structured
logs and a container. Inference, Web resolution and customer telemetry are not
implemented yet; inference paths return 404. No Web, database or provider
credentials are needed to build, start or test this package.

## Run locally

Install Rust through rustup; `rust-toolchain.toml` pins the toolchain and required
components. After the usual repository `pnpm install`, run from the repository
root:

```sh
pnpm dev:gateway
```

This loads the root `.env` and uses Turbo Watch to restart the gateway when its
source changes. Add gateway settings from the root `.env.dev.example` to your
existing `.env`. Exported shell variables take precedence. The ordinary root
`pnpm dev` keeps the gateway opt-in and does not start it.

To start once without watching, run `pnpm dev` from `ai-gateway/`. Cargo also
works independently of Node/pnpm; it reads exported environment variables only,
without automatically loading `.env`. Run it from this directory so rustup
selects the pinned toolchain:

```sh
cd ai-gateway
cargo run --locked
```

In another terminal:

```sh
curl --fail http://localhost:8080/health
# {"status":"ok"}
curl --fail http://localhost:8080/ready
# {"status":"ready"}
```

The binary reads configuration from the process environment. The pnpm development
script loads the root `.env` before starting it; production and direct Cargo runs
do not load dotenv files. See the root `.env.dev.example`. All settings have defaults:

| Variable | Default | Validation |
| --- | --- | --- |
| `LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS` | `0.0.0.0:8080` | IP address and port; IPv6 uses `[::]:8080` |
| `LANGFUSE_AI_GATEWAY_LOG_LEVEL` | `info` | `off`, `error`, `warn`, `info`, `debug`, `trace` |
| `LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS` | `10` | Integer from 1 to 300 |

Invalid values fail startup without echoing their contents. Logs are JSON and
contain service lifecycle events, not request bodies or headers. For direct
host-only development, set `LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS=127.0.0.1:8080`.

## Process lifecycle

- `/health` returns 200 while HTTP is serving. It never probes dependencies.
- `/ready` returns 200 after initialization. On shutdown, readiness changes to
  503 with `{"status":"draining"}` and the listener stops accepting connections.
  An external probe may see a closed connection instead of the brief 503 state.
- SIGTERM or Ctrl-C starts graceful shutdown. In-flight requests may finish
  within the configured timeout. Deadline expiry exits nonzero and terminates
  remaining runtime tasks; ordinary shutdown exits zero.
- The deadline starts on the shutdown signal, not at process startup. Future
  stream/export slices must integrate their own work into this lifecycle.

## Container

From the repository root:

```sh
docker build --target runtime -t langfuse-ai-gateway:dev ./ai-gateway
docker run --rm --name langfuse-ai-gateway-dev \
  -p 127.0.0.1:8080:8080 langfuse-ai-gateway:dev
# In another terminal:
docker stop --time 15 langfuse-ai-gateway-dev
bash ai-gateway/scripts/smoke-image.sh langfuse-ai-gateway:dev
```

The runtime image runs as UID/GID 10001, includes CA certificates, and executes
the binary directly so it receives signals. Set the container/orchestrator stop
grace period longer than the gateway shutdown timeout. The smoke test uses an
isolated container and an ephemeral host port, checks read-only/non-root startup,
probes, missing inference routes and a clean SIGTERM exit, then removes it.

## Optional Compose Watch

From the repository root, using Docker Compose with `develop.watch` and
`sync+restart` support:

```sh
docker compose -f docker-compose.dev.yml --profile gateway up --build --force-recreate -d ai-gateway
docker compose -f docker-compose.dev.yml --profile gateway watch --no-up ai-gateway
```

This starts only the gateway. Ordinary `pnpm run infra:dev:up` remains unchanged.
`LANGFUSE_AI_GATEWAY_PORT` selects its host port (default 8080); `HOST_IP` defaults to
127.0.0.1. The container listener remains `0.0.0.0:8080`. Rebuilding and recreating
before Watch starts includes edits made while it was stopped and discards stale
files from earlier syncs. The development stop grace
period is 305 seconds, covering the maximum supported 300-second drain timeout;
normal shutdown exits as soon as requests finish.

Source edits sync into the development container and restart its command, which
runs `cargo build --locked` then `exec`s the binary. Compilation errors remain
visible in container logs. After fixing one, use `docker compose -f
docker-compose.dev.yml --profile gateway up --build -d ai-gateway` if the watcher cannot
sync into the stopped container, then resume Watch. Changes to Cargo manifests,
lockfile, toolchain or Dockerfile rebuild the image. This is a rebuild/restart
workflow, not live code replacement. No separate Rust watcher is required.

Stop the watcher with Ctrl-C; remove its container explicitly:

```sh
docker compose -f docker-compose.dev.yml --profile gateway rm --stop --force ai-gateway
```

The opt-in development profile does not define Helm defaults or deploy anything
to production. There is no second Web/worker process or production Compose wiring.

## Tests and module boundaries

From the repository root:

```sh
pnpm --filter @langfuse/ai-gateway build
pnpm --filter @langfuse/ai-gateway typecheck
pnpm --filter @langfuse/ai-gateway lint
pnpm --filter @langfuse/ai-gateway test
pnpm --filter @langfuse/ai-gateway format
```

These scripts delegate to Cargo. Root `pnpm build`, `pnpm typecheck`, `pnpm lint`
and `pnpm test` include the gateway; its Turbo tasks have no Prisma/JavaScript
dependencies and disable Turbo caching, leaving incremental builds to Cargo.
The JavaScript CI jobs and commit-hook lint exclude it; the dedicated Rust CI job
runs its checks without Node. Root Prettier formatting remains JavaScript/CSS-only;
use the gateway `format` script for Rust. Docker builds also use Cargo directly.

Equivalent Cargo checks, without pnpm:

```sh
cd ai-gateway
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
```

- `config.rs`: pure configuration parsing plus the environment adapter.
- `server.rs`: router, probe state and bounded graceful shutdown. A listener and
  shutdown future are injected, so tests do not depend on fixed ports or signals.
- `main.rs`: configuration, logging, signal registration and process exit.
- `tests/support`: local ephemeral-port HTTP servers with injected Axum routers.
  `fake_dependency_records_requests_and_returns_scripted_response` demonstrates
  configurable status/body/headers and request recording. Specialized provider
  streaming scripts belong with the slices that consume them.

Tests exercise real local HTTP requests, config rejection/redaction, readiness
transition, in-flight draining and a stuck-handler deadline. CI runs these Cargo
checks and the container smoke test independently of JavaScript builds; its result
is a dependency of the required `all-ci-passed` gate. It currently runs for all
eligible PRs, so source, lockfile, toolchain and Docker changes are all covered.
