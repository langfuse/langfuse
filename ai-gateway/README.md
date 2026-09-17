# AI Gateway service

A standalone Rust gateway for `POST /openai/v1/responses`. Web resolves the gateway
key to a trusted provider connection; Rust relays native JSON or SSE without
rewriting provider bytes. A bounded capture layer captures request/response facts and
logs capture completeness at debug level. Each finalized execution is immediately
uploaded as a Langfuse generation through OTLP. Building and testing need no real
Web, database or provider credentials.

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
restores the cached debug gateway binary when its inputs are unchanged, then
rebuilds and restarts it after Rust source changes; Web and worker keep their
built-in watchers. The gateway loads the root `.env` and listens on the first
available port starting at 8080. This lets multiple worktrees run their
development stacks at the same time. Add overrides from the table below to your
root `.env`; exported shell variables take precedence.
Without a Web URL, the process starts with liveness available; readiness and
inference return 503. To enable inference, configure the Web URL and shared service key.

To work on only the gateway, use `pnpm dev --filter=ai-gateway`.
Both commands watch Rust source changes; do not run both on the same port.

To start once without watching, run `pnpm dev` from `ai-gateway/`. Cargo also
works independently of Node/pnpm; it reads exported environment variables only,
without automatically loading `.env`. Direct Cargo and production starts fail
if the configured port is occupied unless port auto-increment is explicitly
enabled. Run it from this directory so rustup selects the pinned toolchain:

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
| `LANGFUSE_AI_GATEWAY_AUTO_INCREMENT_LISTEN_PORT` | `false` | `true`, `false`; the pnpm dev task sets `true` |
| `LANGFUSE_LOG_FORMAT`                          | `text`         | `text`, `json`                                     |
| `LANGFUSE_LOG_LEVEL`                           | `info`         | `debug`, `info`, `warn`, `error`, `fatal` |
| `LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS` | `10`           | Integer from 1 to 300                              |
| `LANGFUSE_AI_GATEWAY_MAX_ACTIVE_REQUESTS` | `128` | Positive integer up to Tokio's semaphore capacity; authenticated requests per instance |
| `LANGFUSE_AI_GATEWAY_MAX_CONCURRENT_RESOLUTIONS` | `128` | Positive integer up to Tokio's semaphore capacity; concurrent Web resolutions per instance |

The gateway shares `LANGFUSE_LOG_LEVEL` with Web and worker. Values are lowercase;
`fatal` maps to Rust's `error` level and therefore includes ordinary error logs.

Set `LANGFUSE_LOG_FORMAT=text` in the root `.env` for compact, readable logs
(the default). Use `LANGFUSE_LOG_FORMAT=json` for structured production logs.
Both formats use the same log level and preserve event fields. For example:

```text
2026-09-10T13:20:00Z INFO gateway listening address=0.0.0.0:8080
```

Invalid values fail startup without echoing their contents. At the default `info`
level, logs contain service lifecycle events and HTTP response summaries.
Debug logging adds content-free phase and capture details. For direct
host-only development, set `LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS=127.0.0.1:8080`.

## Operational observability

Logs and operational OpenTelemetry exports describe gateway health independently
of the inference generations sent to Langfuse. They do not include request/response
content, credentials, key metadata, or URL query strings. Health probes are excluded
from request logs and spans.

Use `LANGFUSE_LOG_FORMAT=text` locally and `json` for log collectors. Built-in `tracing-subscriber` formatters handle both modes. JSON event fields
are top-level attributes; span fields are nested. HTTP response and execution
summaries include top-level `trace_id` and `span_id` for Datadog correlation.
`info` emits lifecycle, HTTP response, and execution summaries; `debug` adds
sanitized capture details. Other log events do not automatically include trace IDs. Dependency logs stay at `warn`. Log severity does not control
trace sampling. `trace` is not an accepted gateway log level.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | Enables operational traces and metrics; HTTP/protobuf base URL, e.g. `http://localhost:4318` |
| `OTEL_SERVICE_NAME` | `ai-gateway` | Operational service name |
| `DD_ENV` | `development` | Deployment environment resource attribute |
| `BUILD_ID` | Cargo package version | Service version; set to the deployed image's commit SHA |
| `OTEL_TRACES_SAMPLER_ARG` | `1` | Sampling ratio from 0 to 1 for independent operational root traces |

Tower's `TraceLayer` keeps the server span alive through the response body.
The HTTP response log and `http.server.request.duration` measure time to response
headers, not full SSE duration. Execution summaries and `gateway.phase.duration`
with `phase=execution` measure the provider relay through completion, cancellation,
timeout, or transport error. HTTP status and stream outcome are separate: a 200
response can still fail while streaming.

`reqwest-tracing` instruments resolver, provider-header, and ingestion requests.
Each request starts a fresh operational trace, independent of incoming trace IDs,
tracestate, baggage, Langfuse headers and sampling decisions. Only trusted Web calls
receive this internal W3C trace context; the external provider receives no tracing
or Langfuse headers. Inference generations use the caller context described below.
Client spans measure the HTTP send through response headers;
streaming execution and inference-telemetry delivery are tracked separately.

A small Axum middleware records `http.server.request.duration` through the
OpenTelemetry SDK, with method, matched route, and HTTP status as its only
dimensions. The histogram's count supplies request volume and error rates,
including responses rejected before provider execution. Metrics are independent
of trace sampling. Health probes are excluded.

Gateway-specific metrics include `gateway.active` (resolution/execution),
`gateway.phase.duration` (execution/provider.first_byte), `gateway.executions`,
`gateway.admission.rejected`, and `gateway.telemetry.records`. Durations use seconds;
first-byte timing measures provider bytes arriving at the gateway, not first-token
delivery to the caller. Metric attributes contain bounded categories, not tenant
or request identifiers.

Trace export uses a 512-span queue, batches of up to 64, and a one-second interval.
Metrics export every 30 seconds. Export calls use a three-second timeout; failures
do not fail inference. Shutdown flushes within the remaining shared drain deadline.
Telemetry delivery warnings report the first failure/drop and every hundredth;
metrics count each occurrence. This is best-effort operational telemetry.

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

The gateway forwards inference to the official OpenAI Responses endpoint only. It does not
retry, follow redirects, or accept client routing overrides. Request parsing is
best-effort capture only; Web still selects the provider connection.
Provider errors retain their status and body. Gateway errors use an OpenAI-style
`{"error":{"message":"...","type":"...","param":null,"code":"..."}}` envelope.

The gateway authenticates through Web before reserving execution capacity or
reading the request body. Web resolution uses a separate concurrency budget,
released after resolution finishes; authenticated requests then reserve execution
capacity through body reading and response completion. Either budget returns 503
immediately when full, without a waiting queue. Both defaults of 128 are provisional
guardrails, not measured capacity: tune them independently using load tests for the
instance resources, request sizes and stream durations. These limits bound work;
they do not guarantee fairness between clients or tenants.

Other limits are 4 MiB request bodies, 10 seconds to read a request, 5 seconds to
connect, 120 seconds for provider response headers or an individual upstream read,
and 600 seconds overall from execution admission. Response size is not capped: a single task pumps chunks
through a one-slot channel, with chunks at most 64 KiB. It stops reading when that
channel fills. Completion, disconnect and deadline release admission and context;
the deadline runs even when the downstream stops polling. A failure after headers
terminates the response body without adding an error event or retrying.
There is no separate downstream stall timeout; a client that stops reading can
retain execution capacity until the overall deadline. A progress-based downstream
stall policy is deferred to a separate change.

Only request content type/encoding and accept cross the provider boundary, plus
the resolved Bearer token. The gateway sets `Accept-Encoding: identity` upstream
so client compression preferences cannot disable JSON/SSE capture. Response
content type/encoding, cache control, retry-after, request ID and selected OpenAI
timing/version/rate-limit
headers are retained. Cookies, routing overrides, gateway/ingestion credentials,
hop-by-hop headers and upstream framing are excluded.

## Langfuse uploads

When inference is configured, each finalized execution starts one background POST
to the Web base URL's `/api/public/otel/v1/traces` endpoint. The client response and
provider admission never wait for ingestion. There is no batching, waiting queue,
retry, or durable delivery. A successful upload acknowledges ingestion acceptance;
storage and cost processing still happen asynchronously in Langfuse.

The original resolver-issued project grant authenticates the upload, together with
a fresh gateway HMAC signature over that grant. The uploader uses the existing Web
URL and service key, preserves deployment prefixes, disables redirects and proxies,
and never sends the provider credential or the client's gateway key to ingestion.
Ingestion JWTs stay outside serializable capture facts and debug logs. Expired grants
are dropped without re-resolving the execution. Requests explicitly select v4 ingestion.

Each execution becomes one generation with a new observation ID and either the
caller's trace/parent IDs or a generated root trace ID,
actual/requested model, model parameters, native usage, and trusted key/connection
attribution. Full mode includes the captured input/output; usage mode omits content.
Completion-start time is emitted only for upstream `text/event-stream` responses,
on the first nonempty text, reasoning, refusal, tool-input, audio, or partial-image content. JSON responses
and streams without a captured content delta have no completion-start time or TTFT.
The exporter projects native OpenAI usage into the receiver's supported shape for
pricing without duplicating it in metadata. Missing usage is not reported as zero.

Gateway metadata uses `langfuse.gateway.*`: `project_id`, `organization_id`,
`ingestion_mode`, `api_format`, `api-key.id`, and `provider.connection_id`,
`provider.request_id`, `provider.response_id`. API-key attribution entries appear
both as top-level metadata and under `langfuse.gateway.api-key.metadata.*`.
Gateway, agent and OpenTelemetry fields win collisions; the namespaced attribution
copy preserves the original value. `http_status` stays top level. Relay outcome,
provider status, completeness flags and first-byte timing remain internal facts
rather than generation metadata. Ingestion removes mapped observation-attribute
duplicates for the gateway scope while preserving custom attributes, scope and
resources.

Provider HTTP failures and failed SSE responses set the generation level to `ERROR`
with the available HTTP status in its status message. Full mode also includes a
bounded provider error code/message; usage mode omits these details because provider
errors may echo request content.

Provisional upload limits are 32 concurrent tasks, 4 MiB serialized facts per record,
16 MiB total retained serialized-fact/credential bytes, 8 MiB encoded payloads, and
64 KiB ingestion responses. Serialization and mapping have additional bounded memory
overhead; these byte budgets are not an RSS limit. Uploads have a two-second connect
timeout and a five-second total timeout, shortened to the grant's remaining lifetime.
Capacity exhaustion, oversized payloads, auth/HTTP errors, rejected OTLP spans, and
transport failures are reported without changing inference results. Sanitized logs
record failures/drops; shutdown reports accepted, failed and dropped counts.

SIGTERM marks the gateway unready, drains inference, then finishes uploads within
the remaining shared shutdown budget. At the deadline, unfinished uploads are
cancelled and counted as drops. Process crashes or forced shutdown can lose telemetry;
these records are not a durable accounting ledger.

`telemetry/mod.rs` owns admission and task lifecycle, `telemetry/mapping.rs` maps facts,
and `telemetry/otlp.rs` owns encoding and HTTP delivery. The uploader already accepts
a span collection; future project batching can replace immediate scheduling while
retaining each execution's original attribution/content policy and selecting a valid
compatible grant. Capture and provider byte forwarding do not need to change.

## Caller tracing context

Incoming `traceparent` and `tracestate` apply only to the Langfuse generation.
A valid `traceparent` supplies its trace ID and parent observation ID; the generation
always gets a new observation ID. Missing or malformed context starts a new root.
Valid `tracestate` is included in the generation's OTLP `traceState` field; it is not
copied into generation metadata. An unsampled caller still produces a generation.
Operational trace sampling and best-effort ingestion remain independent.

The following optional headers enrich the generation, including in usage mode:

| Header | Format | Python SDK baggage key |
| --- | --- | --- |
| `langfuse-trace-name` | String | `langfuse_trace_name` |
| `langfuse-session-id` | String | `langfuse_session_id` |
| `langfuse-user-id` | String | `langfuse_user_id` |
| `langfuse-tags` | Comma-separated strings | `langfuse_tags` |
| `langfuse-metadata` | Comma-separated `key:value` entries | `langfuse_metadata_<key>` |

For example:

```text
langfuse-trace-name: support-workflow
langfuse-session-id: conversation-123
langfuse-user-id: user-456
langfuse-tags: support,production
langfuse-metadata: team:search,variant:B,note:hello%2C%20world
```

Percent-encode literal commas and other escaped characters in individual custom
header values, and colons inside metadata keys. Metadata splits at the first colon;
values remain strings. A literal `+` stays `+` in custom headers. Tags are trimmed
and deduplicated. Valid explicit headers override baggage for the same field;
metadata merges by key with explicit entries winning. Invalid entries are ignored
independently, and invalid overrides leave valid baggage intact. Caller metadata
cannot replace protected gateway facts or trusted API-key attribution.

Extraction is bounded to 8 KiB across the eight context header values above
(`traceparent`, `tracestate`, `baggage` and the five custom headers). Above that
limit, context is ignored and a fresh generation trace is created. Decoded fields
are limited to 1 KiB; each baggage/tag/metadata list is limited to 64 entries.
Repeated list header lines are combined in order within that same entry limit.
Empty values, control characters, invalid encoding and duplicate scalar headers
are ignored without rejecting inference.

Python callers can use `propagate_attributes(..., as_baggage=True)` with HTTP
instrumentation or explicit OTel header injection. Baggage decoding handles Python's
`+` space encoding and quoted-list tags, as well as JSON-array tags. Only the keys
listed above are mapped; other baggage, including `langfuse_trace_id`, does not
override trace identity or project selection.

The gateway also recognizes correlation headers emitted by coding agents:

| Agent | Session source | Turn source |
| --- | --- | --- |
| Claude Code | `x-claude-code-session-id` | Not available |
| Codex | `thread_id` in `x-codex-turn-metadata` | `turn_id` in `x-codex-turn-metadata` |
| OpenCode | `x-opencode-session`, falling back to `x-session-id` or `x-session-affinity` for an OpenCode user agent | `x-opencode-request` |
| Pi | `x-session-id`, `session_id`, `x-session-affinity`, or `x-client-request-id` for a Pi user agent | Not available |

An inferred session becomes `<agent>:<session>` and an inferred turn deterministically
selects the generation trace ID, grouping the requests made before and after tool
execution into one trace. A valid `traceparent` always wins trace identity; explicit
Langfuse session and trace-name headers or baggage always win their respective
attributes. Agent headers never infer a user ID.

Original identifiers remain searchable in generation metadata under `agent.*`.
This includes `agent.name`, `agent.project_id`, `agent.session_id`,
`agent.thread_id`, `agent.turn_id`, `agent.id`, `agent.parent_id`, and
`agent.parent_session_id` when the source agent provides them. Codex's
routing-oriented `session_id` is retained as metadata, while its
conversation-oriented `thread_id` supplies the Langfuse session.

Agent extraction has a separate 8 KiB aggregate header limit. Codex turn metadata is
limited to 4 KiB, and each extracted identifier uses the same 1 KiB field limit as
the explicit context headers. Empty, duplicate, malformed, oversized, or
control-character-bearing values are ignored. Generic affinity/request headers are
used only after an agent-specific header or user agent identifies the caller.

Caller context is kept outside ambient operational context and operational logs.
Resolver and ingestion HTTP requests propagate only the gateway's internal trace;
the generation's caller context travels in the ingestion payload. Provider requests
receive neither tracing context nor these custom headers.

## Response capture

Set `LANGFUSE_LOG_LEVEL=debug` to print one `gateway response captured` event at
execution end with HTTP status, timing, capture completeness and relay outcome.
Operational logs exclude prompts, outputs, model parameters and key metadata,
including at debug level. `LANGFUSE_LOG_FORMAT=json` emits one JSON object per line.

Web's resolved ingestion mode controls content capture:

- `full`: input retains native `input`, `instructions`, tools, prompt/context
  references and unknown fields. Model and configuration are projected out of input.
  Output is an ordered array of native completed items. Content is sent only through
  Langfuse ingestion.
- `usage`: input and output are null. Model, scalar parameters, native usage,
  timing and trusted attribution are retained; request schemas/content are omitted.

Full-mode model parameters include sampling/token limits, service tier, reasoning,
text formatting, tool choice/limits, context management, truncation, streaming options,
background/store/include flags, moderation and cache options/retention. Capture retains
JSON types; ingestion applies Langfuse's existing model-parameter normalization
(booleans and structured values become JSON strings). Omitted request parameters
are not filled with assumed defaults.
The response model and service tier take precedence over requested values when present.
Request `metadata`, `prompt_cache_key`, `safety_identifier` and deprecated `user` are
stored under `langfuse.gateway.provider.request.*` only in full mode.

In both modes, `usage_details` preserves the provider's entire usage object,
including nested and unknown fields. The gateway does not rename counters,
subtract cached tokens, or synthesize totals. Missing usage stays null.
`api_format` identifies the payload format (`openai.responses` today).

For SSE, only `response.output_item.done` adds output. Terminal Responses events
provide model, service tier, status and usage; their repeated output is not copied.
Deltas are never stitched or retained. A disconnect midway through an item loses
that unfinished item; already completed items remain in the partial record. Item
completion alone is not response completion. JSON responses capture their native
output array at EOF. Missing usage remains null, rather than invented zeros.

`outcome` describes the relay (`eof`, `cancelled`, `timeout`, `transport_error`);
`provider_status` is separate. For example, a completed provider response can
still end with downstream cancellation. `first_byte_ms` measures the first body
bytes observed by the gateway for operational metrics. `completion_start_ms` measures
the first captured SSE content delta independently; it ignores response-created
events and keepalives and does not retain or reconstruct delta content.

`input_complete` means request input was captured and configuration projected; it is false when
content is omitted in usage mode. `output_complete` means response inspection
finished without capture gaps for the configured mode (including a terminal event
and all expected completed items for full-mode SSE). It does not promise that the
provider succeeded or that delivery to the client finished. `capture_complete`
combines request inspection and output completeness; intentionally omitted usage-mode
content does not make it false. Request inspection failure does not invalidate a
fully captured response, and downstream cancellation does not erase completed capture.

The implementation separates shared `ExecutionCapture` lifecycle/timing, the
`OpenAiResponsesCapture` adapter and bounded `SseDecoder`. A private `ProtocolCapture`
enum dispatches to the adapter. Finalization hands an owned `InferenceFacts` record
to telemetry for a safe debug summary and immediate upload. Another provider can supply
native facts through the same interface without changing the relay. The current
usage mapping targets OpenAI Responses; no Anthropic adapter is implemented yet.
Capture and upload run independently of log level; debug emission alone is gated.

Capture is limited to 1 MiB request inspection, 1 MiB JSON/SSE event inspection,
1 MiB retained output and 256 output items per execution. The active-request limit
bounds the number of captures. Trusted key metadata is bounded by the resolver's
256 KiB response limit. Oversized input is omitted; oversized output items
are skipped and completeness is false. Malformed, truncated or compressed bodies
do not interrupt the relay. Capture buffers are independent of forwarding, so
these limits never cap the actual provider response. Media is not fetched/uploaded.

Provider credentials, the gateway credential and ingestion tokens are not part of
the capture record; raw headers are not logged. Full captured content and resolved
key metadata remain in Langfuse ingestion and are excluded from operational logs.

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
docker build --target runtime \
  --build-arg BUILD_ID="$(git rev-parse HEAD)" \
  -t langfuse-ai-gateway:dev ./ai-gateway
docker run --rm --name langfuse-ai-gateway-dev \
  -e LANGFUSE_LOG_FORMAT=json -p 127.0.0.1:8080:8080 langfuse-ai-gateway:dev
# In another terminal:
docker stop --time 15 langfuse-ai-gateway-dev
bash ai-gateway/scripts/smoke-image.sh langfuse-ai-gateway:dev
```

The `BUILD_ID` build argument is stored as runtime `BUILD_ID`, so operational
telemetry identifies the built commit. Omit the build argument to use the Cargo
package version, or override `BUILD_ID` at runtime.

The runtime image runs as UID/GID 10001, includes CA certificates, and executes
the binary directly so it receives signals. Set the container/orchestrator stop
grace period longer than the gateway shutdown timeout. The smoke test uses an
isolated container and an ephemeral host port, checks read-only/non-root startup,
probes, rejection of unauthenticated inference and a clean SIGTERM exit, then removes it.

## Tests and module boundaries

### Web resolution client

`resolution::ControlPlaneClient` resolves a gateway key through an operator-configured Web
base URL. The binary initializes it when a Web URL is configured. The
caller supplies the existing `LANGFUSE_AI_GATEWAY_SERVICE_KEY` and a trusted Web
base URL to `ControlPlaneConfig::new`. HTTPS is required except on loopback for local
development. URLs cannot contain credentials, a query or fragment. Include the
Web deployment's `NEXT_PUBLIC_BASE_PATH`, if set: both `https://host/app` and
`https://host/app/` resolve through `/app/api/internal/ai-gateway/v1/resolve`.

```rust,no_run
use ai_gateway::resolution::{ApiFormat, ResolutionError, ControlPlaneClient, ControlPlaneConfig};

async fn example(web_base_url: &str, service_key: &str, gateway_key: &str)
    -> Result<(), ResolutionError>
{
    let control_plane = ControlPlaneClient::new(ControlPlaneConfig::new(web_base_url, service_key)?)?;
    let context = control_plane.resolve(gateway_key, ApiFormat::OpenAiResponses).await?;
    assert_eq!(context.connection().base_url(), "https://api.openai.com/v1");
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
dependencies. Turbo caches successful checks and only the final release binary,
not Cargo's potentially large `target` directory. Development similarly caches
only the final debug binary so unchanged gateway builds can be reused across
worktrees.
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
- `inference.rs`: `InferenceService` coordinates resolution, admission and forwarding.
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
