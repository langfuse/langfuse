# AI Gateway service foundation

A standalone Rust HTTP process with health probes, bounded shutdown, structured
logs and a container, with a tested Web resolution client library. Inference and
customer telemetry are not implemented yet; inference paths return 404. No Web, database or provider
credentials are needed to build, start or test this package.

## Run locally

Alongside the repository's Node.js/pnpm setup, install [Rust via rustup](https://rust-lang.org/tools/install/)
and a native compiler/linker: Xcode Command Line Tools on macOS (`xcode-select --install`),
GCC/Clang on Linux (Ubuntu: `sudo apt install build-essential`), or MSVC C++ Build Tools on Windows.
Ensure `~/.cargo/bin` is on your PATH (reopen the terminal after installing rustup).
`rust-toolchain.toml` selects Rust 1.98.0 with Clippy and rustfmt automatically;
the first run needs network access to download the toolchain and Cargo dependencies.
No separate Rust watcher is needed.

After the usual repository `pnpm install`, run from the repository root:

```sh
pnpm dev
```

This starts the gateway alongside the other development services. Turbo Watch
recompiles and restarts the gateway after Rust source changes; Web and worker
keep their built-in watchers. The gateway loads the root `.env` and listens on
port 8080 by default. Add overrides from the table below to your root `.env`;
exported shell variables take precedence.
No gateway-specific credentials are needed for this foundation slice.

To work on only the gateway, use `pnpm dev --filter=ai-gateway`.
Both commands watch Rust source changes; do not run both on the same port.

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
do not load dotenv files. All settings have defaults:

| Variable                                       | Default        | Validation                                         |
| ---------------------------------------------- | -------------- | -------------------------------------------------- |
| `LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS`           | `0.0.0.0:8080` | IP address and port; IPv6 uses `[::]:8080`         |
| `LANGFUSE_LOG_FORMAT`                          | `text`         | `text`, `json`                                     |
| `LANGFUSE_LOG_LEVEL`                           | `info`         | `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS` | `10`           | Integer from 1 to 300                              |

The gateway shares `LANGFUSE_LOG_LEVEL` with Web and worker. Values are lowercase;
`fatal` maps to Rust's `error` level and therefore includes ordinary error logs.

Set `LANGFUSE_LOG_FORMAT=text` in the root `.env` for compact, readable logs
(the default). Use `LANGFUSE_LOG_FORMAT=json` for structured production logs.
Both formats use the same log level and preserve event fields. For example:

```text
2026-09-10T13:20:00Z INFO gateway listening address=0.0.0.0:8080
```

Invalid values fail startup without echoing their contents. Logs contain service
lifecycle events, not request bodies or headers. For direct
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
  -e LANGFUSE_LOG_FORMAT=json -p 127.0.0.1:8080:8080 langfuse-ai-gateway:dev
# In another terminal:
docker stop --time 15 langfuse-ai-gateway-dev
bash ai-gateway/scripts/smoke-image.sh langfuse-ai-gateway:dev
```

The runtime image runs as UID/GID 10001, includes CA certificates, and executes
the binary directly so it receives signals. Set the container/orchestrator stop
grace period longer than the gateway shutdown timeout. The smoke test uses an
isolated container and an ephemeral host port, checks read-only/non-root startup,
probes, missing inference routes and a clean SIGTERM exit, then removes it.

## Tests and module boundaries

### Web resolution client

`resolution::Resolver` resolves a gateway key through an operator-configured Web
base URL. It is a library boundary; the binary does not initialize it yet. The
caller supplies the existing `LANGFUSE_AI_GATEWAY_SERVICE_KEY` and a trusted Web
base URL to `ResolverConfig::new`. HTTPS is required except on loopback for local
development. URLs cannot contain credentials, a query or fragment. Include the
Web deployment's `NEXT_PUBLIC_BASE_PATH`, if set: both `https://host/app` and
`https://host/app/` resolve through `/app/api/internal/ai-gateway/v1/resolve`.

```rust,no_run
use ai_gateway::resolution::{ApiFormat, ResolveError, Resolver, ResolverConfig};

async fn example(web_base_url: &str, service_key: &str, gateway_key: &str)
    -> Result<(), ResolveError>
{
    let resolver = Resolver::new(ResolverConfig::new(web_base_url, service_key)?)?;
    let execution = resolver.resolve(gateway_key, ApiFormat::OpenAiResponses).await?;
    assert_eq!(execution.connection().base_url(), "https://api.openai.com/v1");
    Ok(())
}
```

Each call sends `POST <base path>/api/internal/ai-gateway/v1/resolve` with
`Authorization: Bearer <gateway key>`, the Web v1 HMAC header, and exactly
`{"apiFormat":"openai.responses"}`. The client neither receives nor parses an
inference request body. Reuse the resolver across requests: its connection pool is
shared, while credentials and execution contexts stay request-local.

The whole HTTP exchange has a five-second deadline and a 256 KiB response limit,
including chunked responses. Redirects, automatic retries, ambient proxy settings
and transparent decompression are disabled. Errors expose fixed categories;
upstream error bodies and transport details are discarded. Successful responses
must match the strict v1 schema, the official OpenAI Responses connection, and an
unexpired project ingestion grant. Ingestion tokens remain opaque. Resolution
caching, provider execution and telemetry are separate slices.

### Verification

From the repository root:

```sh
pnpm --filter ai-gateway build
pnpm --filter ai-gateway typecheck
pnpm --filter ai-gateway lint
pnpm --filter ai-gateway test
pnpm --filter ai-gateway format
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
- `resolution/mod.rs`: trusted base URL configuration and bounded Web HTTP client.
- `resolution/contracts.rs`: strict Web response validation and immutable execution context.
- `resolution/signing.rs`: Web v1 HMAC; a literal shared fixture pins byte compatibility.
- `tests/support`: local ephemeral-port HTTP servers with injected Axum routers.
  `fake_dependency_records_requests_and_returns_scripted_response` demonstrates
  configurable status/body/headers and request recording. Specialized provider
  streaming scripts belong with the slices that consume them.

Tests exercise real local HTTP requests, config rejection/redaction, readiness
transition, in-flight draining and a stuck-handler deadline. CI runs these Cargo
checks and the container smoke test independently of JavaScript builds; its result
is a dependency of the required `all-ci-passed` gate. It currently runs for all
eligible PRs, so source, lockfile, toolchain and Docker changes are all covered.
