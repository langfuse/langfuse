# Normalized I/O parser

One parser owns observation I/O interpretation. `normalizeIO(source)` turns
raw observation input/output/metadata into a canonical, provider-independent
representation; downstream consumers (ClickHouse tool columns, eval records,
rendering) derive their shapes from that representation.

## Interface

```ts
normalizeIO(source: NormalizeIOSource): NormalizedIO

type NormalizeIOSource =
  | { kind: "event-record"; record } // ClickHouse event row (metadata as name/value column arrays)
  | { kind: "io"; io }               // { input, output, metadata }
  | { kind: "otel"; span; context }; // raw OTel span
```

`NormalizedIO` contains:

- `messages` — one ordered stream: input messages, then output messages,
  original order preserved within each. Every message carries `role`,
  ordered `parts`, an optional `finishReason`, and `source: "input" | "output"`
  (the observation boundary, recoverable by projections).
- `toolDefinitions` — the tools available to the model, merged across
  input, output, and metadata.
- `span` — the raw pre-normalization `{ input, output, metadata }`, always
  returned.

## The part union

Parts encode _what a consumer can do with the content_; provider-specific
semantics ride in part-level `providerMetadata`, never as extra part types.

| Part          | Content                                                                                                                                 | Notes                                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`        | `text`                                                                                                                                  | citations/annotations land in `providerMetadata.citations`                                                                                                                                  |
| `reasoning`   | `content` union: `{kind:"text", text, signature?}` \| `{kind:"redacted", data}` \| `{kind:"encrypted", data}` \| `{kind:"data", value}` | visible CoT/summaries; provider-withheld blobs; replayable encrypted blobs; structured payloads                                                                                             |
| `tool-call`   | `toolCallId` (nullable), `toolName`, `input`, `toolType?`, `providerExecuted?`, `index?`                                                | `toolType` set only for non-function kinds (`custom`, raw built-in item types); `providerExecuted` for server-side tools                                                                    |
| `tool-result` | `toolCallId` (nullable), `toolName?`, `output`, `isError?`                                                                              | AI-SDK `{type, value}` output wrappers are unwrapped                                                                                                                                        |
| `file`        | `content` union: `{kind:"url"}` \| `{kind:"base64"}` \| `{kind:"reference", id}`, `mediaType?`, `filename?`                             | all media, incl. `@@@langfuseMedia:…@@@` tokens → references; `mediaType` is exact when declared, a modality wildcard (`image/*`) when only the part kind reveals it, absent for opaque ids |
| `data`        | `value`                                                                                                                                 | structured non-message payloads (function-span args/results, loose records) — JSON-passthrough parity with the trace view                                                                   |
| `custom`      | `kind`, `value`                                                                                                                         | recognized-but-unmapped typed blocks, verbatim (e.g. `source`, `document`)                                                                                                                  |

Well-known `providerMetadata` flags are typed as `KnownPartFlags`:
`refusal` (model refusals stay findable text), `reasoning`
(reasoning-generated files), `invalid` (unparsable tool-call attempts —
visible in the stream, excluded from tool columns).

`finishReason` is `{ type, raw }`: provider vocabularies (OpenAI
`finish_reason`, Anthropic `stop_reason`, Gemini `finishReason`, AI-SDK
variants) canonicalize to
`stop | length | tool-calls | content-filter | error | other | unknown`,
with the provider's verbatim value kept in `raw`.

## How parsing works

Recognition is **shape-based** — the parser never dispatches on a provider
label, because real payloads are mixed-dialect (AI-SDK and Anthropic blocks
in one message, LangChain wrapping OpenAI). The pipeline:

1. **Source → raw values.** Event rows zip their metadata name/value column
   arrays; plain IO passes through; OTel extraction is a stub pending the
   processor extraction. Every value crosses **at most
   one JSON-string boundary per owner** — nested encoded strings are decoded
   by whichever step consumes them, never eagerly (double-encoded payloads
   are common; eager deep-parsing corrupts legitimate strings).
2. **Container discovery.** Top-level shapes are unwrapped: `messages`
   arrays, bare item arrays (OpenAI Responses style — standalone tool-call
   items batch into synthetic assistant messages; `mcp_list_tools` feeds
   `toolDefinitions` side-band), `choices[]` / `candidates[]` response
   envelopes (choice-level finish reasons attach to their message), Gemini
   `contents` + `system_instruction`, or a single record.
3. **Message normalization.** Envelope unwraps first (Semantic Kernel
   `gen_ai.event.content`, the LangChain `lc`/`kwargs` serialization
   envelope with the role derived from the class path, GenAI choice events
   `{index, message, finish_reason}`), then Python-repr message strings
   (agno). Roles normalize to
   `system | developer | user | assistant | tool | unknown` with deliberate
   coercions: `model → assistant`, deprecated `function → tool` (name becomes
   the tool name), role-less Responses reasoning items → `assistant` (model
   output even in replayed input history), user messages consisting solely of
   tool results → `tool`, tool-labeled turns without a `tool_call_id` →
   assistant call batches or tool-results (the content _is_ the tool's
   response), unrecognized declared roles → `unknown` with the raw string
   preserved as `name`.
4. **Part normalization.** Per message: content arrays/parts run through the
   part parser; string content splits into interleaved text and file parts
   around embedded media tokens; JSON-string arrays of tool shapes parse into
   tool parts. Sibling fields fold in: `tool_calls` (+
   `additional_kwargs.tool_calls`), `invalid_tool_calls` (flagged), Anthropic
   `thinking` arrays, OpenAI `refusal`/`audio`/`annotations`, Responses
   reasoning `summary`/`encrypted_content`, `finish_reason` (message-level,
   envelope-level, or `response_metadata`). The part parser itself
   recognizes, in order: provider-executed built-in items, Gemini keyed
   parts (`functionCall`, `inlineData`, `executableCode`, bare `{text}` with
   `thought`/`thoughtSignature`), the typed-block switch (OpenAI, Anthropic,
   AI-SDK block types), shape-sniffed tool calls without a recognized type,
   and finally the `data`/`custom` fallback. Messages that produce no parts
   but have no message keys become single `data`-part messages (JSON
   passthrough) rather than being dropped.
5. **Accumulation.** Tool-call parts dedup by `toolCallId` (fallback:
   name + input) **within each side only** — a call echoed across the
   input/output boundary is kept on both sides. Tool definitions merge by
   name with first-seen-wins per field across input → output → metadata, so
   request-time declarations win and later echoes only fill gaps.

## Semantics and invariants

Each entry states the behavior, why, and how to challenge it. Challenge by
fixture: add a failing case to the test suite, then either the behavior falls
or the fixture documents it.

### Tool calls

- **Dedup is scoped to one side; a call in output always counts.**
  Instrumentation frequently reports the same call twice on one side (in
  `tool_calls` and again as a content part). Across sides, no dedup — the
  trace view concatenates without dedup, and outputs echoing full history
  attribute historical calls to this observation (accepted, shared with the
  trace view and legacy extractor).
- **Id-less identical calls collapse** (key: name + input). The dedup's
  primary job is killing the common echo, which appears at different
  positions — positional disambiguation would rescue the rare genuine
  id-less parallel duplicate by double-counting the common echo. Legacy
  collapses identically; providers that care emit ids.
- **Absent ids are `null`;** the column projection maps `null` to `""` for
  byte-compatibility with the legacy ClickHouse format.
- **Tool columns count executable output-side calls only**: input-side calls
  are history from earlier turns; `invalid`-flagged attempts are excluded.
  Consumers that need history calls read `messages`, not the columns.
- **Unnamed provider tools are admitted** into `toolDefinitions` (name
  derived from the tool type, e.g. `web_search_preview`) — available-tool
  filtering covers provider built-ins; the legacy extractor's exclusion was
  accidental.

### Messages and content

- **`source` preserves the input/output boundary in one ordered stream** —
  rendering wants one conversation; projections need the boundary back.
- **Messages whose only content is an empty string are dropped.** Non-string
  payloads are never coerced to text — structured values become `data`.
- **Media normalizes to file parts.** Reference tokens (the dominant stored
  shape after ingestion uploads payloads) map to `{kind: "reference", id}`
  with `mediaType` from the token — exactly what `LangfuseMediaView`
  resolves. Raw base64 data-URIs (only present when upstream media
  processing skipped or failed) stay `url` content; the parser reads the
  declared prefix type but never decodes payloads — that is
  `MediaPayloadProcessor`'s job. Text with embedded media tokens splits into
  interleaved text/file parts so text consumers never see tokens.
- **Citations are unified**: Anthropic `citations` and OpenAI `annotations`
  (part- and message-level) land under `providerMetadata.citations`,
  payloads verbatim. Anchor-less references (AI-SDK `source` parts) stay
  stream-positioned as `custom {kind: "source"}` — one vocabulary, two
  carriers, matching what the source actually provides.
- **`SpanIO.metadata` may carry an `attributes` record with OTel keys**; the
  parser mines known tool-definition attribute keys from it
  (`ai.prompt.tools`, `gen_ai.tool.definitions`, `llm.tools.N.…`,
  `model_request_parameters.function_tools`). Open tension: these are
  OTel-format names inside the transport-independent core.

### Intentional losses

- Anthropic `cache_control` (request caching hint).
- LangChain `tool_call_chunks` (streaming deltas, redundant with parsed
  `tool_calls` on final messages).
- Response-envelope metadata (Gemini `usageMetadata`/`modelVersion`, OpenAI
  Responses envelope `status`) — usage and model info have their own
  pipeline columns; the raw envelope survives in `span`.
- Anthropic text/structured-content documents become
  `custom {kind: "document"}` — semantic content, not resolvable files.

## Format coverage

OpenAI Chat Completions + Responses API, Anthropic Messages, Vercel AI SDK,
Gemini/Vertex, LangChain/LangGraph (incl. the `lc` serialization envelope),
Microsoft Agent Framework, Pydantic AI, Semantic Kernel, agno/koog-style
loose shapes, GenAI event streams, and raw passthrough. Providers without
dedicated handling (Bedrock, Mistral, Cohere, …) ride the generic
shape-sniffing paths; targeted handling is added only when validation
produces a concrete miss.

## Projections

- `projections/toolCallColumns.ts` — `NormalizedIO` → the legacy ClickHouse
  `tool_definitions`/`tool_calls`/`tool_call_names` column format.
- `projections/evalRecord.ts` — `NormalizedIO` + observation → eval-ready
  record (input/output message split, output-side tool calls).
