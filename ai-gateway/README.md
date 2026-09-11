# AI Gateway service

A standalone Rust gateway for `POST /openai/v1/responses`. Web resolves the gateway
key to a trusted provider connection; Rust relays native JSON or SSE without
parsing the request or rewriting provider bytes. Customer telemetry is not exported
yet. Building and testing need no real Web, database or provider credentials.

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
Without a Web URL, the process starts with liveness available; readiness and
inference return 503. To enable inference, configure the Web URL and shared service key.

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
curl http://localhost:8080/ready
# 503 without configuration; 200 {"status":"ready"} when configured
```

The binary reads configuration from the process environment. The pnpm development
script loads the root `.env` before starting it; production and direct Cargo runs
do not load dotenv files:

| Variable                                       | Default        | Validation                                         |
| ---------------------------------------------- | -------------- | -------------------------------------------------- |
| `LANGFUSE_AI_GATEWAY_WEB_URL` | unset; inference disabled | Trusted Web base URL, including any deployment prefix |
| `LANGFUSE_AI_GATEWAY_SERVICE_KEY` | unset | Required with Web URL; same key configured in Web |
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

## Call the gateway

Set these in the repository root `.env` for `pnpm dev` (or export them for Cargo):

```dotenv
LANGFUSE_AI_GATEWAY_WEB_URL=http://localhost:3000
LANGFUSE_AI_GATEWAY_SERVICE_KEY=<same-service-key-as-web>
```

For production use the HTTPS Web URL; include `/app` when Web was built with that
base path. Web also needs its existing ingestion JWT signer configured, an enabled
gateway key, and an eligible OpenAI connection. Rust needs neither the JWT signing
key nor an operator-supplied OpenAI key: provider credentials come from resolution.
A service key alone does not enable inference without the Web URL.

```sh
curl http://localhost:8080/openai/v1/responses \
  -H "Authorization: Bearer $LANGFUSE_GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4.1-mini","input":"Say hello"}'
# Add "stream":true to the JSON and use curl -N for SSE.
```

```python
from openai import OpenAI
import os

client = OpenAI(
    base_url="http://localhost:8080/openai/v1",
    api_key=os.environ["LANGFUSE_GATEWAY_KEY"],
    max_retries=0,
)
response = client.responses.create(model="gpt-4.1-mini", input="Say hello")
print(response.output_text)
```

The gateway forwards to the official OpenAI Responses endpoint only. It does not
retry, follow redirects, parse `model`/`stream`, or accept client routing overrides.
Provider errors retain their status and body. Gateway errors use an OpenAI-style
`{"error":{"message":"...","type":"...","param":null,"code":"..."}}` envelope.

Internal limits are 128 admitted executions, 4 MiB request bodies, 10 seconds to
read a request, 5 seconds to connect, 120 seconds for provider response headers or
an individual upstream read, and 600 seconds overall from admission. Full capacity
returns 503 immediately. Response size is not capped: a single task pumps chunks
through a one-slot channel, with chunks at most 64 KiB. It stops reading when that
channel fills. Completion, disconnect and deadline release admission and context;
the deadline runs even when the downstream stops polling. A failure after headers
terminates the response body without adding an error event or retrying.

Only request content type/encoding and accept/accept-encoding cross the provider
boundary, plus the resolved Bearer token. Response content type/encoding, cache
control, retry-after, request ID and selected OpenAI timing/version/rate-limit
headers are retained. Cookies, routing overrides, gateway/ingestion credentials,
hop-by-hop headers and upstream framing are excluded.

## Process lifecycle

- `/health` returns 200 while HTTP is serving. It never probes dependencies.
- `/ready` returns 200 after initialization with inference configured. It does not
  probe Web or OpenAI; dependency failures are reported per request. Without a Web
  URL it returns 503. On shutdown, readiness changes to
  503 with `{"status":"draining"}` and the listener stops accepting connections.
  An external probe may see a closed connection instead of the brief 503 state.
- SIGTERM or Ctrl-C starts graceful shutdown. In-flight requests may finish
  within the configured timeout. Deadline expiry exits nonzero and terminates
  remaining runtime tasks; ordinary shutdown exits zero.
- The shutdown deadline starts on the shutdown signal. New inference requests
  are rejected while draining; existing response streams share this budget.

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
probes, rejection of unauthenticated inference and a clean SIGTERM exit, then removes it.

## Tests and module boundaries

### Web resolution client

`resolution::Resolver` resolves a gateway key through an operator-configured Web
base URL. The binary initializes it when a Web URL is configured. The
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
- `http.rs`: credential extraction, bounded body reads and gateway error envelopes.
- `execution.rs`: resolve then execute orchestration with immutable trusted context.
- `providers/openai.rs`: fixed destination, provider credentials and admission.
- `transport/mod.rs`: header allowlists, bounded byte relay and response lifetime.
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
