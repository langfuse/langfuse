# AI Gateway service

A standalone Rust gateway for native provider APIs under two namespaces:

| Namespace       | Endpoints                                                                             | Generation ingested                     |
| --------------- | ------------------------------------------------------------------------------------- | --------------------------------------- |
| `/openai/v1`    | `POST /responses`, `POST /responses/compact`, `POST /chat/completions`, `GET /models` | Responses, compact and Chat Completions |
| `/anthropic/v1` | `POST /messages`, `POST /messages/count_tokens`, `GET /models`                        | Messages                                |

Web resolves the gateway key to a trusted provider connection for the namespace's API
format; Rust relays native JSON or SSE without rewriting provider bytes, except that a
streamed Chat Completions request is asked for its usage (see below). Models listings
are GET proxies of the provider catalog and token counting returns the native count;
neither is ingested as a generation. A bounded capture layer captures request/response
facts and logs capture completeness at debug level. Each finalized generation is
uploaded as a Langfuse generation through OTLP, batched per project. Building and
testing need no real Web, database or provider credentials.

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

| Variable                                                 | Default                   | Validation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LANGFUSE_AI_GATEWAY_WEB_URL`                            | unset; inference disabled | Trusted Web base URL, including any deployment prefix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `LANGFUSE_AI_GATEWAY_SERVICE_KEY`                        | unset                     | Required with Web URL; same key configured in Web                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `LANGFUSE_AI_GATEWAY_ALLOW_HTTP_WEB_URL`                 | `false`                   | `true`, `false`; `true` also accepts a plain `http://` Web URL on any host. Only for internal traffic, such as Web's in-cluster Kubernetes Service (`http://<release>-web.<namespace>.svc.cluster.local:3000`) or another private network; never for a URL that crosses the public internet, because resolve responses carry provider API keys and requests carry the service key and ingestion tokens unencrypted. Resolution, model catalogs and trace uploads all use this URL. The gateway logs a warning at startup when it is used |
| `LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS`                     | `0.0.0.0:8080`            | IP address and port; IPv6 uses `[::]:8080`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `LANGFUSE_AI_GATEWAY_AUTO_INCREMENT_LISTEN_PORT`         | `false`                   | `true`, `false`; the pnpm dev task sets `true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `LANGFUSE_LOG_FORMAT`                                    | `text`                    | `text`, `json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `LANGFUSE_LOG_LEVEL`                                     | `info`                    | `debug`, `info`, `warn`, `error`, `fatal`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `LANGFUSE_AI_GATEWAY_CONNECTION_DRAIN_TIMEOUT_SECONDS`   | `10`                      | Integer from 1 to 300; connection drain after the shutdown signal. Replaces the deprecated `LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS`, which is still read when the new name is unset. On ECS behind an ALB, the deregistration delay drains streams before SIGTERM, so use `1`. On Kubernetes the gateway drains streams itself, so set it to the stream time to protect (for example `300`)                                                                                                                                        |
| `LANGFUSE_AI_GATEWAY_TELEMETRY_SHUTDOWN_TIMEOUT_SECONDS` | `10`                      | Integer from 1 to 300; telemetry flush after the drain ends. On ECS use most of `stopTimeout` (max 120), for example `115`. On Kubernetes `30` is enough; set `terminationGracePeriodSeconds` above the `preStop` sleep plus both timeouts                                                                                                                                                                                                                                                                                               |
| `LANGFUSE_AI_GATEWAY_TELEMETRY_BUFFER_BYTES`             | `67108864` (64 MiB)       | Integer from 4194304 (4 MiB) to 4294967296 (4 GiB); span and credential bytes an instance holds for upload before dropping new records                                                                                                                                                                                                                                                                                                                                                                                                   |
| `LANGFUSE_AI_GATEWAY_MAX_REQUEST_BYTES`                  | `16777216` (16 MiB)       | Integer from 1048576 (1 MiB) to 4294967295; largest accepted request body                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `LANGFUSE_AI_GATEWAY_MEMORY_BUDGET_BYTES`                | `1073741824` (1 GiB)      | Integer from the request limit plus the overhead up to Tokio's semaphore capacity; bytes all in-flight requests and model catalogs of an instance may reserve together                                                                                                                                                                                                                                                                                                                                                                   |
| `LANGFUSE_AI_GATEWAY_REQUEST_MEMORY_OVERHEAD_BYTES`      | `2097152` (2 MiB)         | Integer from 0 to 4294967295; fixed bytes each request reserves on top of its body for response capture and buffers                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `LANGFUSE_AI_GATEWAY_MAX_EXECUTION_SECONDS`              | `600`                     | Integer of at least 60; ceiling from execution admission until the response completes. Web ingestion tokens last 15 minutes, so traces of longer executions may be dropped                                                                                                                                                                                                                                                                                                                                                               |
| `LANGFUSE_AI_GATEWAY_STALL_TIMEOUT_SECONDS`              | `120`                     | Integer from 1 to the execution ceiling; longest wait without progress                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

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
content, credentials, key metadata, or URL query strings. They do carry the
[resolution context](#resolution-context), including the provider connection name
and the requested model. Health probes are excluded
from request logs and spans.

Use `LANGFUSE_LOG_FORMAT=text` locally and `json` for log collectors. Built-in `tracing-subscriber` formatters handle both modes. JSON event fields
are top-level attributes; span fields are nested. HTTP response and execution
summaries include top-level `trace_id` and `span_id` for Datadog correlation.
Every JSON log line emitted while serving an inference request also carries a
top-level `request_id`; see [Request IDs](#request-ids).
`info` emits lifecycle, HTTP response, and execution summaries; `debug` adds
sanitized capture details. Other log events do not automatically include trace IDs. Dependency logs stay at `warn`. Log severity does not control
trace sampling. `trace` is not an accepted gateway log level.

| Variable                      | Default               | Purpose                                                                                      |
| ----------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset                 | Enables operational traces and metrics; HTTP/protobuf base URL, e.g. `http://localhost:4318` |
| `OTEL_SERVICE_NAME`           | `ai-gateway`          | Operational service name                                                                     |
| `DD_ENV`                      | `development`         | Deployment environment resource attribute                                                    |
| `BUILD_ID`                    | Cargo package version | Service version; set to the deployed image's commit SHA                                      |
| `OTEL_TRACES_SAMPLER_ARG`     | `1`                   | Sampling ratio from 0 to 1 for independent operational root traces                           |

Tower's `TraceLayer` keeps the server span alive through the response body.
The HTTP response log and `http.server.request.duration` measure time to response
headers, not full SSE duration; the `gateway response completed` log reports the
stream duration once the body reaches end of stream. Execution summaries and
`gateway.phase.duration` with `phase=execution` measure the provider relay through
completion, cancellation, timeout, or transport error. HTTP status and stream
outcome are separate: a 200 response can still fail while streaming. The server
span carries `http.request.body.size`, `gateway.outcome`, and
`gateway.first_byte_ms` once they are known.

### Request IDs

Every inference request gets a fresh UUIDv7 gateway request ID (time-ordered, no prefix) at ingress, before
authentication, so it exists for every response, including rejections before
resolution, 4xx/5xx gateway errors and streams. It appears in:

| Where                                  | Field                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------- |
| Every response                         | `langfuse-request-id` header, sent with the initial headers of a stream |
| Gateway JSON error bodies              | Top-level `request_id` in both native envelopes                         |
| Gateway JSON log lines for the request | Top-level `request_id`                                                  |
| Operational server span                | `gateway.request.id`                                                    |
| Web resolution call                    | `langfuse-gateway-request-id` header; Web adds it to its log context    |
| Langfuse generation                    | `langfuse.gateway.request.id` metadata                                  |

A caller's `x-request-id` never becomes the gateway request ID. A single printable
value of at most 256 bytes is recorded separately as the server span's
`gateway.client.request.id` and as `langfuse.gateway.client.request.id` generation
metadata; it is not forwarded to Web or the provider. The provider's own request ID
(OpenAI `x-request-id`, Anthropic `request-id`) is recorded as the server span's
`provider_request_id` on every route and as `langfuse.gateway.upstream.request.id`
generation metadata, and its response header is still relayed unchanged.

When the request will produce a Langfuse generation (`/openai/v1/responses`,
`/openai/v1/responses/compact`, `/openai/v1/chat/completions` and
`/anthropic/v1/messages` with inference telemetry
configured), the response also carries `langfuse-trace-id` and
`langfuse-observation-id`: the uploaded generation's trace ID, after `traceparent`
and agent turn grouping, and its OpenTelemetry span ID, which Langfuse stores as the
observation ID. They are also set on 502/504 responses for provider failures before
response headers, which still upload a generation. Requests rejected earlier, such
as authentication failures, and model or token-count routes omit them. Upload is
best-effort, so a dropped generation can leave these IDs unresolved. The gateway
does not set CORS headers, so no `Access-Control-Expose-Headers` is involved.

### Resolution context

Once Web resolution succeeds, the request also carries its tenant, and once it is
sent upstream, the provider connection it was sent to. Requests rejected before
resolution, including invalid or oversized bodies, carry none of them. Provider failures
before response headers (502/504) still name the connection that was tried.

| Response header                   | Server span field                  | JSON log key               | Value                                                                            |
| --------------------------------- | ---------------------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| `langfuse-organization-id`        | `langfuse.organization.id`         | `organization_id`          | Organization of the gateway key                                                  |
| `langfuse-project-id`             | `langfuse.project.id`              | `project_id`               | Ingestion project                                                                |
| `langfuse-provider`               | `gateway.provider`                 | `provider`                 | Stable lowercase provider type, `openai` or `anthropic`                          |
| `langfuse-provider-connection-id` | `gateway.provider.connection.id`   | `provider_connection_id`   | Opaque provider connection ID                                                    |
| —                                 | `gateway.provider.connection.name` | `provider_connection_name` | The connection's user-chosen name; never sent to callers                         |
| —                                 | `gateway.upstream.model`           | `upstream_model`           | The request's `model`, which the relay forwards unchanged; never sent to callers |

The provider fields describe the latest upstream attempt, so with fallbacks they
name the connection that served the response, or the last one tried. The model
comes from the request capture's existing parse, so it is recorded only on the
generation routes listed above, when the body is uncompressed JSON of at most 5 MiB.
The span fields are declared empty on the `http.server` span and recorded after
resolution; child spans do not repeat them. JSON log lines emitted inside the
request after they are recorded repeat them as top-level keys, like `request_id`.
Apart from the bounded `gateway.provider`, they are never metric attributes.

Each inference request phase has a child span of the server span so a waterfall
has no unattributed wall time:

| Span               | Covers                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `resolution`       | The `resolver` Web call; `gateway.outcome` is `admitted` or `resolution_failed`                                                                                                            |
| `request.body`     | Buffering the caller's request body, mostly upload time; `http.request.body.size`                                                                                                          |
| `request.capture`  | Parsing the request for inference telemetry; CPU-bound and proportional to `http.request.body.size`                                                                                        |
| `provider.headers` | The provider HTTP send through response headers, including connection setup                                                                                                                |
| `provider.stream`  | Relaying the provider body to the caller until the relay is finalized; `http.response.body.size`, `gateway.chunks`, `gateway.outcome`, and an error status on timeout or transport failure |

Inference-telemetry uploads carry records from many requests, so each runs in its
own trace: a root `telemetry.batch` span with `gateway.telemetry.records` and a span
link to every request it carries, and an `ingestion` client span per HTTP attempt.

`reqwest-tracing` instruments resolver, provider-header, and ingestion requests.
Each request starts a fresh operational trace, independent of incoming trace IDs,
tracestate, baggage, Langfuse headers and sampling decisions. Only trusted Web calls
receive this internal W3C trace context; the external provider receives no tracing
or Langfuse headers. Inference generations use the caller context described below.
Client spans measure the HTTP send through response headers;
streaming execution and inference-telemetry delivery are tracked separately.

A small Axum middleware records `http.server.request.duration` through the
OpenTelemetry SDK, with method, matched route, HTTP status, `error.origin`,
`error.reason`, and `gateway.provider` as its dimensions. The histogram's count
supplies request volume and error rates, including responses rejected before
provider execution. Metrics are independent of trace sampling. Health probes are
excluded.

`error.origin` names who caused a failed response: `none`, `client`,
`gateway`, `control_plane`, `provider_transport`, or `provider` (an error status
relayed unchanged, with `error.reason` `provider_rate_limited`, `provider_auth`,
`provider_4xx`, or `provider_5xx`). The server span carries the same origin and
reason (as `error.type`); it has an error status only for 5xx.

Gateway-specific metrics:

- `gateway.overhead.duration` (`http.route`, `gateway.provider`): time to response
  headers minus the caller's upload and the provider's wait; recorded only for
  requests that reached the provider.
- `http.server.request.body.size` (`http.route`, `gateway.provider`) and
  `http.server.response.body.size` (`gateway.provider`), in bytes: the buffered
  request body, and the bytes relayed from the provider, including truncated or
  cancelled streams.
- `gateway.active` and `gateway.active.peak` (`phase`): in-flight and
  most-in-flight-since-last-export model_catalog/resolution/execution work.
- `gateway.memory.budget`, `gateway.memory.reserved`, and
  `gateway.memory.reserved.peak`, in bytes: the configured memory budget, the bytes
  in-flight requests hold, and the most held since the last export. Peak utilisation
  is `gateway.memory.reserved.peak / gateway.memory.budget`.
- `gateway.phase.duration` (execution/provider.first_byte), `gateway.executions`,
  `gateway.admission.rejected` (`phase`: `request`, `request_body` or
  `model_catalog`), and `gateway.telemetry.records`.

Durations use seconds; first-byte timing measures provider bytes arriving at the
gateway, not first-token delivery to the caller. Metric attributes contain
bounded categories, not tenant or request identifiers.

Trace export uses a 512-span queue, batches of up to 64, and a one-second interval.
Metrics export every 30 seconds. Export calls use a three-second timeout; failures
do not fail inference. Shutdown flushes within the remaining telemetry shutdown budget.
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

curl http://localhost:8080/openai/v1/responses/compact \
  -H "Authorization: Bearer $LANGFUSE_GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4.1","input":[]}'

curl http://localhost:8080/openai/v1/chat/completions \
  -H "Authorization: Bearer $LANGFUSE_GATEWAY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4.1-mini","messages":[{"role":"user","content":"Say hello"}]}'

curl http://localhost:8080/openai/v1/models \
  -H "Authorization: Bearer $LANGFUSE_GATEWAY_KEY"
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
completion = client.chat.completions.create(
    model="gpt-4.1-mini", messages=[{"role": "user", "content": "Say hello"}]
)
print(completion.choices[0].message.content)
```

### Chat Completions streaming usage

OpenAI reports usage for a streamed Chat Completions request only when the request
sets `stream_options.include_usage`. When a request has `"stream":true` and does not
set it to `true`, the gateway adds `"include_usage":true` to the upstream copy so the
generation still gets token usage and cost; other `stream_options` fields and every
other top-level member keep their original bytes and order. The recorded input and
model parameters are the caller's own request. The response stream is relayed byte
for byte, so a client that did not request usage still receives OpenAI's final usage
chunk: an extra event with an empty `choices` array and a `usage` object, just before
`data: [DONE]`. The other chunks of such a stream also carry `"usage":null`. Clients
must tolerate a chunk without choices, as they already must when they request usage
themselves. Requests that already ask for usage, content-encoded bodies, ambiguous
bodies (duplicate `stream` or `stream_options` members) and non-streamed requests are
forwarded unchanged.

### Anthropic Messages and Claude Code

The `/anthropic/v1` namespace serves the Anthropic Messages API. Claude Code treats the
gateway as the Claude API once `ANTHROPIC_BASE_URL` points at the namespace root; the
SDK appends `/v1/messages` itself, so the URL has no `/v1` suffix:

```sh
export ANTHROPIC_BASE_URL=http://localhost:8080/anthropic
export ANTHROPIC_AUTH_TOKEN=$LANGFUSE_GATEWAY_KEY
export ANTHROPIC_API_KEY=            # a leftover Anthropic key here conflicts with the token
claude
```

`ANTHROPIC_AUTH_TOKEN` arrives as `Authorization: Bearer`, `ANTHROPIC_API_KEY` as
`x-api-key`; the gateway accepts its key in either position. When both headers are
present they must carry the same value, otherwise the request is rejected with 401
rather than guessing which credential the developer meant. Claude Code's
`x-claude-code-session-id` header groups a session's generations; see the caller
tracing context below.

```sh
curl http://localhost:8080/anthropic/v1/messages \
  -H "x-api-key: $LANGFUSE_GATEWAY_KEY" \
  -H 'anthropic-version: 2023-06-01' \
  -H 'Content-Type: application/json' \
  -d '{"model":"claude-sonnet-4-5","max_tokens":64,"messages":[{"role":"user","content":"Say hello"}]}'
# Add "stream":true and use curl -N for SSE.

curl http://localhost:8080/anthropic/v1/messages/count_tokens \
  -H "x-api-key: $LANGFUSE_GATEWAY_KEY" \
  -H 'anthropic-version: 2023-06-01' \
  -H 'Content-Type: application/json' \
  -d '{"model":"claude-sonnet-4-5","messages":[{"role":"user","content":"Say hello"}]}'

curl "http://localhost:8080/anthropic/v1/models?limit=1000" \
  -H "x-api-key: $LANGFUSE_GATEWAY_KEY" -H 'anthropic-version: 2023-06-01'
```

Every `anthropic-*` request header is forwarded verbatim, including `anthropic-version`
and `anthropic-beta`: Claude Code pairs beta body fields with beta header values and
adds new headers between releases, so the gateway does not allowlist individual
values. Request bodies, including the `system` array order and `cache_control`
markers, are relayed byte for byte. On responses `request-id`, `x-should-retry`,
`anthropic-organization-id` and every `anthropic-ratelimit-*` header are retained
because the client uses them to decide whether and when to retry and to show usage
limits. Provider error bodies are relayed unmodified; Claude Code matches on their
wording to disable rejected capabilities. Model discovery
(`CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`) proxies Anthropic's catalog and
forwards only the `limit`, `after_id` and `before_id` query parameters.

### Relay rules

The gateway forwards inference to official provider paths only. It does not retry, follow
redirects, or accept client routing overrides. Request parsing is best-effort capture
only; Web still selects the provider connection. Compact `encrypted_content` is relayed
unchanged. Inference routes drop request query strings: the Anthropic SDK's
`?beta=true` carries nothing beyond the `anthropic-beta` header. Provider errors retain
their status and body. Gateway errors use the namespace's native envelope:
`{"error":{"message":"...","type":"...","param":null,"code":"..."},"request_id":"..."}`
for OpenAI and `{"type":"error","error":{"type":"...","message":"..."},"request_id":"..."}`
for Anthropic, where `request_id` is the gateway request ID and the
error type follows the status (`authentication_error`, `permission_error`,
`not_found_error`, `request_too_large`, `invalid_request_error`, `overloaded_error`,
`api_error`).

Admission is bounded by memory only. After validating the credential header, the
gateway reserves a fixed per-request overhead from the instance's memory budget, then
buffers and validates the request and resolves the credential and model-aware route
through Web. A declared `Content-Length` is checked against the request limit before
reading. The reservation grows with the body buffer's allocation as bytes arrive, so a
client that declares a large body and stalls holds only the overhead and what it sent.
The whole reservation stays held until the response ends. Model catalog requests
reserve the overhead, grow it with Web's catalog buffer as it arrives, then to three
times the catalog for parsing and the provider-shaped response, and hold it until the
client has read that response; the response is relayed under the same stall timeout and
execution deadline as provider responses. An exhausted budget returns 503 immediately without a
waiting queue. There is no request-count limit; file descriptors are bounded by the
container.

The overhead stands in for what a request holds besides its body: retained capture
output (up to 1 MiB), one inspected response event (up to 1 MiB), the relay chunk and
resolution context. The 2 MiB default sits above the typical request: on staging,
responses average 8 KB (Anthropic) to 210 KB (OpenAI), with a largest of 3 MB. With
the 1 GiB budget it admits about 400 typical concurrent requests. The parsed request
input kept for capture is covered by the body's reservation, which outlives the
buffered bytes. These limits bound work; they do not guarantee fairness between
clients or tenants.

Request bodies are limited to 16 MiB by default in both namespaces. The body read deadline
scales with that limit: at least 30 seconds, and enough for the maximal body at 10 MiB per
30 seconds (49 seconds at 16 MiB).
Connecting to a provider may take 5 seconds. Executions end at a ten-minute ceiling from
admission by default, and earlier when they stall: 120 seconds by default without an
upstream chunk, without the downstream accepting a chunk, or, for streamed calls
(`"stream": true`) and token counting, without provider response
headers. A non-streamed generation waits for headers until the ceiling, because
providers send nothing until the response is generated. Response size is not capped: a single task pumps chunks
through a one-slot channel, with chunks at most 64 KiB. It stops reading when that
channel fills. Completion, disconnect, stall and ceiling release the memory reservation and context;
both timeouts run even when the downstream stops polling. A failure after headers
terminates the response body without adding an error event or retrying.

Only request content type/encoding and accept cross the provider boundary, plus the
resolved credential in its provider's header (`Authorization: Bearer` for OpenAI,
`x-api-key` for Anthropic) and, for Anthropic, the `anthropic-*` header family. The
gateway sets `Accept-Encoding: identity` upstream so client compression preferences
cannot disable JSON/SSE capture. Response content type/encoding, cache control and
retry-after are retained in both namespaces, plus the request ID and selected OpenAI
timing/version/rate-limit headers, or Anthropic's `request-id`, `x-should-retry`,
`anthropic-organization-id` and `anthropic-ratelimit-*` headers. Cookies, routing
overrides, gateway/ingestion credentials, client `x-claude-code-*` correlation
headers, hop-by-hop headers and upstream framing are excluded.

## Langfuse uploads

When inference is configured, each finalized execution is mapped to a generation
span and queued without waiting. A single delivery worker groups spans by project
and POSTs each batch to the Web base URL's `/api/public/otel/v1/traces` endpoint
when it reaches 512 spans or 4 MiB, five seconds after it opened, 30 seconds before its
grant expires, when more than 256 projects have open batches (the batch due soonest
goes first), or at shutdown. The client response and provider admission never wait
for ingestion. There is no durable delivery. A successful upload acknowledges
ingestion acceptance; storage and cost processing still happen asynchronously in
Langfuse.

A batch gets up to three attempts. Only failures a resend can fix are retried:
transport errors and timeouts, and HTTP 408, 429, 500, 502, 503 or 504. The second
attempt waits 250–500 ms and the third 1–2 s (the upper half of a 0.5 s × 4ⁿ step,
randomized), or longer when `Retry-After` asks for up to 10 s; a longer
`Retry-After`, or a wait that would leave under a second of grant lifetime, fails
the batch instead. Other statuses, expired grants, invalid responses and partial
OTLP rejections are not retried. Each batch is serialized and gzip-compressed once,
off the async runtime, and every attempt resends the identical payload: Web
stores spans by span ID, so a span already ingested by a timed-out attempt is
replaced rather than duplicated. A batch holds an upload slot only while an attempt
runs, but keeps its retained bytes until its last attempt settles, so a failing
ingestion endpoint fills the byte budget and new records are dropped instead of
queuing without bound.

A resolver-issued project grant authenticates the upload, together with a fresh
gateway HMAC signature over that grant. Web authorizes a grant by its organization
and project alone, so a batch uses the latest-expiring grant among its records;
ingestion mode is already applied while mapping each span. The uploader uses the existing Web
URL and service key, preserves deployment prefixes, disables redirects and proxies,
and never sends the provider credential or the client's gateway key to ingestion.
Ingestion JWTs stay outside serializable capture facts and debug logs. Expired grants
are dropped without re-resolving the execution. Requests explicitly select v4 ingestion.

Each execution becomes one generation with a new observation ID and either the
caller's trace/parent IDs or a generated root trace ID, the model, model parameters,
native usage, and trusted key/connection attribution. Full mode includes the captured input/output; usage mode omits content.
Completion-start time is emitted only for upstream `text/event-stream` responses,
on the first nonempty text, reasoning, refusal, tool-input, audio, or partial-image content. JSON responses
and streams without a captured content delta have no completion-start time or TTFT.
OpenAI Responses and Chat Completions usage are projected into the receiver's strict
native schemas (`input_tokens`/`output_tokens` or `prompt_tokens`/`completion_tokens`,
plus `total_tokens`), keeping their nested detail counters. Anthropic usage is uploaded exactly as the provider reported
it; ingestion decides what to price. Usage is not duplicated in metadata. Missing usage
is not reported as zero.

### Generation fields

The gateway sets these generation fields directly:

| Generation field                                              | OTLP attribute                                                                     | Value                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model (`provided_model_name`)                                 | `langfuse.observation.model.name`                                                  | The first known of `model.response`, `model.upstream` and `model.requested` below                                                                                                                                                                                                                                                                                                                                                                 |
| User ID                                                       | `user.id`                                                                          | For a gateway key bound to a user, always that user's email, or their Langfuse user ID if the email is unknown; the caller's user ID is ignored, also with a `traceparent`. Otherwise the caller's `langfuse-user-id` header or `langfuse_user_id` baggage, falling back to the key's name (cut to 512 bytes) when the gateway starts the trace; inside a caller's `traceparent` trace no `user.id` is emitted. The source is in `user_id_source` |
| Session ID, trace name, environment, tags                     | `session.id`, `langfuse.trace.name`, `langfuse.environment`, `langfuse.trace.tags` | Caller headers, baggage or a recognized coding agent; see [Caller tracing context](#caller-tracing-context)                                                                                                                                                                                                                                                                                                                                       |
| Level, status message                                         | `langfuse.observation.level`, `langfuse.observation.status_message`                | Derived from the HTTP status, provider status and relay outcome                                                                                                                                                                                                                                                                                                                                                                                   |
| Model parameters, usage, input, output, completion start time | `langfuse.observation.*`                                                           | See [Response capture](#response-capture)                                                                                                                                                                                                                                                                                                                                                                                                         |
| Metadata                                                      | `langfuse.observation.metadata`                                                    | Caller metadata plus the gateway keys below                                                                                                                                                                                                                                                                                                                                                                                                       |

The generation never emits `user.name` or `gen_ai.*` attributes: ingestion reads them as user ID and model fallbacks.

### Generation metadata

Every gateway fact is a metadata key under `langfuse.gateway.`, grouped by the resource or exchange it describes. The table lists the suffix after that prefix. Source is who supplies the value: the gateway itself, Web at resolve time, or the caller. Caller-sourced values are recorded as received, within the stated bounds; the gateway does not vouch for them.

| Key                                | Type                                                                                                                                   | Source                                                               | Present                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `organization.id`                  | string                                                                                                                                 | Web                                                                  | Always                                                                                  |
| `ingestion.mode`                   | string: `full` or `usage`                                                                                                              | Web                                                                  | Always                                                                                  |
| `api_key.id`                       | string                                                                                                                                 | Web                                                                  | Always                                                                                  |
| `api_key.name`                     | string                                                                                                                                 | Web: the key's note                                                  | When the key has a note                                                                 |
| `api_key.owner.user_id`            | string                                                                                                                                 | Web: the user the key is bound to                                    | When the key is bound to a user; keys created before keys were bound to users have none |
| `api_key.owner.name`               | string                                                                                                                                 | Web: the bound user's display name, never the email                  | When the key is bound to a user with a name                                             |
| `api_key.metadata.<key>`           | string, number or boolean                                                                                                              | Web: the key's metadata                                              | One entry per key metadata entry                                                        |
| `connection.id`                    | string                                                                                                                                 | Web                                                                  | Always                                                                                  |
| `connection.name`                  | string                                                                                                                                 | Web: the connection's display name                                   | When the connection has a name                                                          |
| `connection.provider`              | string: `openai` or `anthropic`                                                                                                        | Web                                                                  | Always                                                                                  |
| `model.requested`                  | string                                                                                                                                 | Caller: request body `model`                                         | When the request body is captured JSON with a model                                     |
| `model.upstream`                   | string                                                                                                                                 | Web: the connection's provider model, sent upstream                  | When the request reached the provider path                                              |
| `model.response`                   | string                                                                                                                                 | Provider: response `model`                                           | When the provider reported one                                                          |
| `user_id_source`                   | string: `client`, `api_key_owner`, or `api_key_name`                                                                                   | Gateway                                                              | When the generation has a user ID                                                       |
| `request.id`                       | string                                                                                                                                 | Gateway                                                              | Always; also the `langfuse-request-id` response header                                  |
| `request.api_format`               | string: `openai.responses`, `openai.chat-completions` or `anthropic.messages`                                                          | Gateway                                                              | Always                                                                                  |
| `request.body_bytes`               | integer                                                                                                                                | Gateway: the caller's uncompressed request body                      | Always                                                                                  |
| `request.input_omitted`            | string: `size_limit`, `content_encoding`, `invalid_json`, `record_limit` or `telemetry_buffer`                                         | Gateway                                                              | Full mode, when the input is not recorded                                               |
| `request.input_limit_bytes`        | integer                                                                                                                                | Gateway                                                              | With `input_omitted` `size_limit`                                                       |
| `client.request.id`                | string                                                                                                                                 | Caller: `x-request-id` header                                        | When valid                                                                              |
| `client.user_agent`                | string, at most 256 bytes                                                                                                              | Caller: `User-Agent` header, trimmed                                 | When present, single and free of control characters                                     |
| `client.request.metadata`          | JSON value as sent                                                                                                                     | Caller: request body `metadata`                                      | Full mode, when sent                                                                    |
| `client.request.user`              | JSON value as sent                                                                                                                     | Caller: request body `user` (deprecated OpenAI field)                | Full mode, when sent                                                                    |
| `client.request.safety_identifier` | JSON value as sent                                                                                                                     | Caller: request body `safety_identifier`                             | Full mode, when sent                                                                    |
| `client.request.prompt_cache_key`  | JSON value as sent                                                                                                                     | Caller: request body `prompt_cache_key`                              | Full mode, when sent                                                                    |
| `upstream.request.id`              | string                                                                                                                                 | Provider: `x-request-id` (OpenAI) or `request-id` (Anthropic) header | When sent                                                                               |
| `upstream.response.id`             | string                                                                                                                                 | Provider: response object `id`                                       | When sent                                                                               |
| `upstream.status_code`             | integer                                                                                                                                | Provider                                                             | When the provider sent response headers                                                 |
| `upstream.retry_after_ms`          | integer                                                                                                                                | Provider: `Retry-After` in seconds, converted to milliseconds        | When the header is an integer; HTTP dates are ignored                                   |
| `response.status_code`             | integer or null                                                                                                                        | Gateway                                                              | Always; null when the caller cancelled before response headers                          |
| `response.body_bytes`              | integer                                                                                                                                | Gateway: provider body bytes relayed to the caller                   | When the provider sent response headers                                                 |
| `error.origin`                     | string: `provider` or `provider_transport`                                                                                             | Gateway                                                              | When the generation failed                                                              |
| `error.type`                       | string: `provider_rate_limited`, `provider_auth`, `provider_4xx`, `provider_5xx`, `provider_response_failed`, `timeout` or `transport` | Gateway                                                              | With `error.origin`                                                                     |

`error.origin` and `error.type` use the same values as the gateway's operational `error.origin`/`error.reason`, so a generation can be matched to the request metrics. A cancellation is not an error. Byte counts are uncompressed: compressed request bodies are rejected, and the provider is asked for an identity-encoded response.

Key metadata appears only under `api_key.metadata.*`, never as bare top-level metadata keys. Caller metadata, key metadata and the `agent.*` keys cannot write `langfuse.gateway.*`, `scope`, `resourceAttributes` or `attributes` keys; the gateway's own keys always win. `agent.*` keys and native request field names keep their existing spelling. Metadata names apply to newly captured generations; historical traces are not rewritten.

`response.status_code` includes gateway-generated 502/504 errors before upstream headers arrive. After headers arrive it retains the relayed status, even if a stream subsequently fails. Relay outcome, provider status, completeness flags and first-byte timing remain internal facts rather than generation metadata. For the gateway scope, ingestion removes Langfuse attributes already mapped to trace and observation fields, such as user, session, trace name, tags and environment, while preserving custom attributes, scope and resources. Ingestion never estimates usage with a tokenizer for gateway generations; it recognizes them by their gateway ingestion credential, not by the instrumentation scope name, which any OTLP sender can set.

Provider HTTP failures and failed SSE responses set the generation level to `ERROR`
with the available HTTP status in its status message. Full mode also includes a
bounded provider error code/message; usage mode omits these details because provider
errors may echo request content.

Provisional upload limits are 32 concurrent uploads, 1024 queued records, 16 MiB
serialized span and credentials per record (a 5 MiB input plus 1 MiB output, each
possibly doubled by JSON string escaping), 64 MiB total retained span/credential
bytes by default (`LANGFUSE_AI_GATEWAY_TELEMETRY_BUFFER_BYTES`), 20 MiB of OTLP JSON per
payload before gzip compression, and
64 KiB ingestion responses. Serialization and mapping have additional bounded memory
overhead; these byte budgets are not an RSS limit. Uploads have a two-second connect
timeout and a 30-second total timeout per attempt, enough for a full payload over a
slow link and shortened to the grant's remaining lifetime.
Capacity exhaustion, oversized payloads, auth/HTTP errors, rejected OTLP spans, and
transport failures are reported per record without changing inference results; a
batch that fails its last attempt fails every record in it. The `telemetry.batch`
span records `gateway.telemetry.attempts`. Sanitized logs
record failures/drops; shutdown reports accepted, failed and dropped counts.

SIGTERM marks the gateway unready, drains inference, then flushes open batches and
finishes uploads within the telemetry shutdown budget, which starts when draining ends. At the deadline, unfinished uploads,
including batches waiting to retry, are cancelled and counted as drops. Process crashes or forced shutdown can lose telemetry;
these records are not a durable accounting ledger.

`telemetry/mod.rs` owns admission and shutdown, `telemetry/mapping.rs` maps facts,
`telemetry/batch.rs` is the pure per-project grouping and flush policy,
`telemetry/retry.rs` is the pure retry decision,
`telemetry/worker.rs` is the delivery actor that owns batches and upload tasks, and
`telemetry/otlp.rs` owns encoding and HTTP delivery.

## Caller tracing context

Incoming `traceparent` and `tracestate` apply only to the Langfuse generation.
A valid `traceparent` supplies its trace ID and parent observation ID; the generation
always gets a new observation ID. Missing or malformed context starts a new root.
Valid `tracestate` is included in the generation's OTLP `traceState` field; it is not
copied into generation metadata. An unsampled caller still produces a generation.
Operational trace sampling and best-effort ingestion remain independent.

The following optional headers enrich the generation, including in usage mode:

| Header                 | Format                              | Python SDK baggage key    |
| ---------------------- | ----------------------------------- | ------------------------- |
| `langfuse-trace-name`  | String                              | `langfuse_trace_name`     |
| `langfuse-session-id`  | String                              | `langfuse_session_id`     |
| `langfuse-user-id`     | String                              | `langfuse_user_id`        |
| `langfuse-environment` | Environment name                    | `langfuse_environment`    |
| `langfuse-tags`        | Comma-separated strings             | `langfuse_tags`           |
| `langfuse-metadata`    | Comma-separated `key:value` entries | `langfuse_metadata_<key>` |

For example:

```text
langfuse-trace-name: support-workflow
langfuse-session-id: conversation-123
langfuse-user-id: user-456
langfuse-environment: production
langfuse-tags: support,production
langfuse-metadata: team:search,variant:B,note:hello%2C%20world
```

Percent-encode literal commas and other escaped characters in individual custom
header values, and colons inside metadata keys. Metadata splits at the first colon;
values remain strings. A literal `+` stays `+` in custom headers. Tags are trimmed
and deduplicated. Valid explicit headers override baggage for the same field;
metadata merges by key with explicit entries winning. Invalid entries are ignored
independently, and invalid overrides leave valid baggage intact. Caller metadata
cannot replace protected gateway facts or trusted API-key attribution. A gateway
key bound to a user ignores the caller's `langfuse-user-id` and `langfuse_user_id`.

The environment follows the SDK rule: at most 40 lowercase letters, digits, `-`
or `_`, not starting with the reserved `langfuse` prefix. An invalid value is
ignored like any other invalid field, so the generation lands in the `default`
environment unless valid baggage supplies one.

Extraction is bounded to 8 KiB across the nine context header values above
(`traceparent`, `tracestate`, `baggage` and the six custom headers). Above that
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

| Agent       | Session source                                                                                          | Turn source                          |
| ----------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Claude Code | `x-claude-code-session-id`                                                                              | Not available                        |
| Codex       | `thread_id` in the Codex turn snapshot                                                                  | `turn_id` in the Codex turn snapshot |
| OpenCode    | `x-opencode-session`, falling back to `x-session-id` or `x-session-affinity` for an OpenCode user agent | `x-opencode-request`                 |
| Pi          | `x-session-id`, `session_id`, `x-session-affinity`, or `x-client-request-id` for a Pi user agent        | Not available                        |

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

Codex sends its turn snapshot canonically in the request body as
`client_metadata["x-codex-turn-metadata"]`; the `x-codex-turn-metadata` header and the
flat `client_metadata` keys (`session_id`, `thread_id`, `turn_id`, `root_turn_id`,
`parent_turn_id`, `x-codex-installation-id`, `x-codex-window-id`,
`x-codex-parent-thread-id`) are compatibility projections of it. The gateway reads the
body snapshot first, then the header, and finally the flat keys. A recognized
`client_metadata` object is removed from the recorded input in full mode because it is
request metadata rather than prompt content; other clients' `client_metadata` stays in
the input untouched. Besides the identifiers above, Codex generations carry
`agent.id` (Codex's `agent_name`, the agent's path in a multi-agent team such as
`/root`), `agent.installation_id`, `agent.root_turn_id`, `agent.parent_turn_id`,
`agent.parent_thread_id`, `agent.forked_from_thread_id`,
`agent.forked_from_ordinal_exclusive`, `agent.window_id`, `agent.window_number`,
`agent.context_window_id`, `agent.request_kind` (`turn`, `compaction`, `prewarm`,
`memory`), `agent.compaction.{trigger,reason,implementation,phase,strategy}`,
`agent.subagent_kind`, `agent.thread_source`, `agent.turn_trigger`, `agent.sandbox`,
`agent.sandbox_mode`, `agent.workspace_kind`, `agent.auto_review_enabled`, and
`agent.turn_started_at_unix_ms`. Numbers and booleans keep their native JSON type.
Nested snapshot objects such as `workspaces` and `tool_namespaces_info` are not
copied, and unknown snapshot keys are ignored so they cannot override `agent.name`.

Agent extraction has a separate 8 KiB aggregate header limit. The Codex turn metadata
header is limited to 4 KiB and the body `client_metadata` object to 64 KiB, and each
extracted identifier uses the same 1 KiB field limit as the explicit context headers.
Empty, duplicate, malformed, oversized, or control-character-bearing values are
ignored. Generic affinity/request headers are used only after an agent-specific header
or user agent identifies the caller.

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
  references and unknown fields. Model, configuration and a recognized coding agent's
  `client_metadata` are projected out of input. Output is an ordered array of native
  completed items. Content is sent only through Langfuse ingestion.
- `usage`: input and output are null. Model, scalar parameters, native usage,
  timing and trusted attribution are retained; request schemas/content are omitted.

Full-mode model parameters include sampling/token limits, service tier, reasoning,
text formatting, tool choice/limits, context management, truncation, streaming options,
background/store/include flags, moderation and cache options/retention. Capture retains
JSON types; ingestion applies Langfuse's existing model-parameter normalization
(booleans and structured values become JSON strings). Omitted request parameters
are not filled with assumed defaults.
The response service tier takes precedence over the requested value when present.
The requested, upstream and response models are all recorded; see
[Generation metadata](#generation-metadata).
Request `metadata`, `prompt_cache_key`, `safety_identifier` and deprecated `user` are
stored under `langfuse.gateway.client.request.*` only in full mode.

In both modes, `usage_details` preserves the provider's entire usage object,
including nested and unknown fields. The gateway does not rename counters,
subtract cached tokens, or synthesize totals. Missing usage stays null.
`api_format` identifies the payload format (`openai.responses`,
`openai.chat-completions` or `anthropic.messages`); it is also the generation's name.

For Anthropic Messages, `message_start` supplies the response ID, actual model and the
usage baseline; `message_delta` supplies `stop_reason` and cumulative usage counters that
replace the baseline values (nothing is summed across snapshots); `message_stop` is the
terminal event. `completion_start_ms` is set by the first `content_block_delta` carrying
non-empty `text`, `thinking` or `partial_json`; signatures, citations and pings do not
count. A mid-stream `error` event, or an HTTP error body, marks the generation failed;
its `type` and `message` are retained only in full mode. Unknown event types are ignored.
A `stop_reason` of `max_tokens` or `model_context_window_exceeded` sets a `WARNING`
level. Scalar model parameters (`max_tokens`, `temperature`, `top_p`, `top_k`,
`stream`, `service_tier`, `speed`) are recorded in both modes; `speed` selects the
fast-mode pricing tier.

In full mode the input is the native request with `model` and parameters projected
out: `stop_sequences`, `thinking`, `tool_choice`, `context_management` and
`output_config` become model parameters and `metadata` (where Claude Code stores its
session identifiers) becomes `langfuse.gateway.client.request.metadata`; `system`, `messages`, `tools` and
unknown fields are kept as sent. The output is the native assistant message
`{"role":"assistant","content":[...],"stop_reason":...}`. JSON responses contribute
their `content` array at EOF. Streams rebuild each block from `content_block_start`,
its deltas and `content_block_stop`: text, thinking and citations are appended, the
opaque `signature` is kept, and `input_json_delta` fragments are parsed into the tool
`input` once the block stops. Unlike OpenAI Responses, Anthropic has no completed-item
event, so these deltas are stitched within the same retained-output budget. Only
stopped blocks are recorded; an unfinished block, tool input that is not valid JSON, an
unknown delta type or a block past the budget is left out and makes the output
partial. Usage mode records neither input nor output.

For OpenAI Chat Completions, scalar model parameters (`temperature`, `top_p`, `n`,
`max_tokens`, `max_completion_tokens`, `presence_penalty`, `frequency_penalty`, `seed`,
`logprobs`, `top_logprobs`, `service_tier`, `parallel_tool_calls`, `reasoning_effort`,
`verbosity`, `stream`, `store`, `prompt_cache_retention`) are recorded in both modes.
In full mode `stop`, `response_format`, `tool_choice`, `function_call`, `stream_options`,
`logit_bias`, `modalities`, `audio`, `prediction` and `web_search_options` also become
model parameters, `metadata`, `prompt_cache_key`, `safety_identifier` and `user` become
`langfuse.gateway.client.request.*`, and `messages`, `tools`, legacy `functions` and unknown
fields remain the input. The output is the native `{"choices":[...]}` list: JSON
responses contribute their choices at EOF; streams rebuild each choice from its
`delta` chunks. Text fragments (`content`, `refusal`, tool and function `arguments`,
audio data) are appended, `tool_calls` are merged by their `index`, `role`, `id` and
`type` are kept once, and each choice records its `finish_reason`. Each chunk supplies
the response ID, actual model and service tier; the usage chunk supplies usage.
`data: [DONE]` is the terminal event, and every choice needs a `finish_reason` for
full-mode output to be complete. A choice whose fragments exceed the retained-output
budget is left out and makes the output partial. `completion_start_ms` is set by the
first delta with non-empty text, refusal, tool or function arguments, or audio; role
headers and tool names do not count. A `finish_reason` of `length` or
`content_filter` sets a `WARNING` level, and an `error` object in the body or a chunk
marks the generation failed, with its `code` and `message` retained only in full mode.

For OpenAI Responses SSE, only `response.output_item.done` adds output. Terminal Responses events
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
`OpenAiResponsesCapture`, `OpenAiChatCompletionsCapture` and `AnthropicMessagesCapture`
adapters, the shared
`ResponseBody` content-type sniffing and bounded `SseDecoder`. A private
`ProtocolCapture` enum dispatches to the adapter selected by API format. Finalization
hands an owned `InferenceFacts` record to telemetry for a safe debug summary and
batched upload. Capture and upload run independently of log level; debug emission
alone is gated.

Capture is limited to 5 MiB request inspection, 1 MiB JSON/SSE event inspection,
1 MiB retained output and 256 output items per execution. The memory budget
bounds the number of captures. Trusted key metadata is bounded by the resolver's
256 KiB response limit. In full mode, an input that is not recorded (over 5 MiB,
content-encoded or not a JSON object) is explained in generation metadata:
`langfuse.gateway.request.input_omitted` (`size_limit`, `content_encoding` or
`invalid_json`) and, for `size_limit`, `langfuse.gateway.request.input_limit_bytes`;
`langfuse.gateway.request.body_bytes` is always present. If a generation with its input would
exceed the telemetry record limit (capped at the retained buffer size) or the buffer
is full, the input is dropped from that record and the generation is still uploaded,
with `input_omitted` set to `record_limit` or `telemetry_buffer`. Oversized output items
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
- The drain deadline (`LANGFUSE_AI_GATEWAY_CONNECTION_DRAIN_TIMEOUT_SECONDS`) starts on the shutdown signal. New inference requests are rejected while draining; existing response streams share this budget.
- Inference telemetry and operational OTLP export then flush within `LANGFUSE_AI_GATEWAY_TELEMETRY_SHUTDOWN_TIMEOUT_SECONDS`, starting when draining ends, so a drain that hits its deadline does not drop open batches.

## Container

Each Langfuse release publishes a multi-platform (linux/amd64, linux/arm64)
image to `langfuse/ai-gateway` on Docker Hub and
`ghcr.io/langfuse/ai-gateway`, tagged like the web and worker images.
Every release publishes `<version>` and `sha-<commit>`. Stable releases also
update `<major>.<minor>` and `<major>`, plus `latest` for v4; release candidates
(`-rc`) do not move these tags. Release images build on the Iron Bank UBI9
bases.

To build locally, from the repository root:

```sh
docker build --target runtime \
  --build-arg BUILD_ID="$(git rev-parse HEAD)" \
  -t langfuse-ai-gateway:dev ./ai-gateway
docker run --rm --name langfuse-ai-gateway-dev \
  -e LANGFUSE_LOG_FORMAT=json -p 127.0.0.1:8080:8080 langfuse-ai-gateway:dev
# In another terminal:
docker stop --time 25 langfuse-ai-gateway-dev
bash ai-gateway/scripts/smoke-image.sh langfuse-ai-gateway:dev
```

The `BUILD_ID` build argument is stored as runtime `BUILD_ID`, so operational
telemetry identifies the built commit. Omit the build argument to use the Cargo
package version, or override `BUILD_ID` at runtime.

The runtime image runs as UID/GID 10001, includes CA certificates, and executes
the binary directly so it receives signals. Set the container/orchestrator stop
grace period longer than the gateway connection drain timeout plus the telemetry shutdown timeout. The smoke test uses an
isolated container and an ephemeral host port, checks read-only/non-root startup,
probes, rejection of unauthenticated inference and a clean SIGTERM exit, then removes it.

The image ships the license notices of every third-party crate compiled into the
binary at `/usr/share/licenses/ai-gateway/THIRD_PARTY_LICENSES.txt`, rendered by
[cargo-about](https://github.com/EmbarkStudios/cargo-about) from `about.hbs`.
`about.toml` lists the accepted licenses; the image build fails when a dependency
uses any other license, so a new license needs an explicit entry there. To render
the file locally: `cargo about generate --locked --fail about.hbs`.

## Tests and module boundaries

### Web resolution client

`resolution::ControlPlaneClient` resolves a gateway key through an operator-configured Web base URL. The binary initializes it when a Web URL is configured. The caller supplies the existing `LANGFUSE_AI_GATEWAY_SERVICE_KEY` and a trusted Web base URL to `ControlPlaneConfig::new`. HTTPS is required except on loopback for local development; `ControlPlaneConfig::with_plain_http`, which the binary uses when `LANGFUSE_AI_GATEWAY_ALLOW_HTTP_WEB_URL=true`, also accepts HTTP on any host, for internal traffic only. URLs cannot contain credentials, a query or fragment. Include the Web deployment's `NEXT_PUBLIC_BASE_PATH`, if set: both `https://host/app` and `https://host/app/` resolve through `/app/api/internal/ai-gateway/v1/resolve`.

```rust,no_run
use ai_gateway::resolution::{ApiFormat, ResolutionError, ControlPlaneClient, ControlPlaneConfig};

async fn example(web_base_url: &str, service_key: &str, gateway_key: &str)
    -> Result<(), ResolutionError>
{
    let control_plane = ControlPlaneClient::new(ControlPlaneConfig::new(web_base_url, service_key)?)?;
    let request_id = "018f47a2-4d6e-7a61-b495-5e5f665c1e12";
    let context = control_plane
        .resolve(gateway_key, ApiFormat::OpenAiResponses, "gpt-4.1", request_id)
        .await?;
    assert_eq!(context.connection().base_url(), "https://api.openai.com/v1");
    Ok(())
}
```

After extracting the model, inference sends
`POST <base path>/api/internal/ai-gateway/v1/resolve` with
`Authorization: Bearer <gateway key>`, the Web v1 HMAC header, and exactly
`{"apiFormat":"<format>","model":"<model>"}`, where the format is the one the public route serves
(`openai.chat-completions` for `/openai/v1/chat/completions`, `openai.responses` for
the other `/openai/v1` routes). The client neither receives nor
parses an inference request body. Reuse the resolver across requests: its connection
pool is shared, while credentials and execution contexts stay request-local.

The whole HTTP exchange has a five-second deadline and a 256 KiB response limit,
including chunked responses. Redirects, automatic retries, ambient proxy settings
and transparent decompression are disabled. Errors expose fixed categories;
upstream error bodies and transport details are discarded. A successful response
must match the v1 schema and carry an unexpired project ingestion grant. Unknown
fields are ignored everywhere except in the provider `auth` object, so Web can add
response fields before the gateway reads them; a credential with an unexpected
field is still an invalid response.
The grant's JWT payload must name the attribution's `organization_id` and
`project_id`: Web writes uploads into the token's project, and telemetry batches may
send any record of a project with any of that project's grants. The gateway reads
these claims without verifying the signature, which Web checks on ingestion.
Its connection must also be one of the known official pairings: the `provider`
serves the requested `api_format`, `base_url` is that provider's official origin,
and `auth` uses that provider's credential scheme. Any other combination is an
invalid response, even if Web selected it.

| Provider    | API format                                    | Official origin                | Credential                                                          |
| ----------- | --------------------------------------------- | ------------------------------ | ------------------------------------------------------------------- |
| `openai`    | `openai.responses`, `openai.chat-completions` | `https://api.openai.com/v1`    | `{"type":"Bearer","token":…}` → `Authorization: Bearer`             |
| `anthropic` | `anthropic.messages`                          | `https://api.anthropic.com/v1` | `{"type":"x-api-key","header":"x-api-key","value":…}` → `x-api-key` |

The connection's `name` and the attribution's `user_id`, `key_name` and `user_name` are optional in the contract, so the gateway also resolves against a Web deployment that predates them. `user_id` is the user the key is bound to and is the key's owner; it must not be blank when present. Blank `name`, `key_name` and `user_name` count as absent. They are snapshots taken at resolve time, recorded on generations as described in [Langfuse uploads](#langfuse-uploads).

`ProviderConnection::credential()` exposes the secret in its header position
(`ProviderCredential::Bearer` or `ProviderCredential::XApiKey`) and has no `Debug`
output. Ingestion tokens remain opaque. Resolution caching is a separate slice.

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
- `providers/mod.rs`: `ProviderTransport`, the `Route` enum of
  official operations (method, upstream path and capture), model rewriting and credential
  placement.
- `providers/model_list`: provider-native OpenAI and Anthropic model catalog responses.
- `transport/mod.rs`: per-format header policies, bounded byte relay and response lifetime.
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
