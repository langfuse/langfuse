# Normalized I/O parser

One parser owns observation I/O interpretation. `normalizeIO(source)` turns
raw observation input/output/metadata into a canonical, provider-independent
representation; downstream consumers (ClickHouse tool columns, eval records,
rendering) derive their shapes from that representation.

## TL;DR

Please only use the normalized parser behind feature flags at this time.
It has not been sufficiently validated against production data yet.

A telemetry JSON blob can contain the same conversation under keys such as
`messages`, `choices`, or `contents`. The parser handles input and output
separately and does three things:

1. **Claim the messages once.** Providers are checked in the explicit order in
   `conventions/index.ts`. The first provider that recognizes a conversation
   container wins. If none does, the parser uses `messages`, then the value
   itself. Other message containers are ignored, so the conversation is not
   added twice.
2. **Normalize those messages.** Each message is split into parts such as text,
   tool calls, tool results, and files. The provider that claimed the messages
   is tried first for each part, but all other providers remain fallbacks. A
   top-level system instruction is added only when the messages do not already
   contain a system message.
3. **Collect tool definitions separately.** Claiming one message container does
   not hide tools stored under another known key or in metadata.

Known fields become the normalized shape. Anything else is kept in
`providerMetadata`, so provider-specific information is not silently lost.

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

Parts encode _what a consumer can do with the content_. Once known fields are
normalized, every unconsumed provider field is preserved in part-level
`providerMetadata`, never as an extra part type. Tool definitions follow the
same remainder rule. Entirely unknown typed blocks remain lossless `custom`
parts, while untyped structured values remain lossless `data` parts.

| Part          | Content                                                                                                                                 | Notes                                                                                                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`        | `text`                                                                                                                                  | citations/annotations land in `providerMetadata.citations`                                                                                                                                                                                                        |
| `reasoning`   | `content` union: `{kind:"text", text, signature?}` \| `{kind:"redacted", data}` \| `{kind:"encrypted", data}` \| `{kind:"data", value}` | visible CoT/summaries; provider-withheld blobs; replayable encrypted blobs; structured payloads                                                                                                                                                                   |
| `tool-call`   | `toolCallId` (nullable), `toolName`, `input`, `toolType?`, `providerExecuted?`                                                          | `toolType` preserves the source kind (`function`, `custom`, provider-specific built-ins); `providerExecuted` marks server-side tools; parallel-call slot indexes are derived positionally by projections, raw streaming `index` fields stay in `providerMetadata` |
| `tool-result` | `toolCallId` (nullable), `toolName?`, `output`, `isError?`                                                                              | AI-SDK `{type, value}` output wrappers are unwrapped                                                                                                                                                                                                              |
| `file`        | `content` union: `{kind:"url"}` \| `{kind:"base64"}` \| `{kind:"reference", id}`, `mediaType?`, `filename?`                             | all media, incl. `@@@langfuseMedia:…@@@` tokens → references; `mediaType` is exact when declared, a modality wildcard (`image/*`) when only the part kind reveals it, absent for opaque ids                                                                       |
| `data`        | `value`                                                                                                                                 | structured non-message payloads (function-span args/results, loose records) — JSON-passthrough parity with the trace view                                                                                                                                         |
| `custom`      | `kind`, `value`                                                                                                                         | recognized-but-unmapped typed blocks, verbatim (e.g. `source`, `document`)                                                                                                                                                                                        |

Parser-computed semantics are typed fields on their parts:
`TextPart.refusal` (model refusals stay findable text), `FilePart.reasoning`
(reasoning-generated files), `ToolCallPart.invalid` (unparsable tool-call
attempts — visible in the stream, excluded from tool columns).
`providerMetadata` carries the verbatim provider-field remainder plus
parser-derived provider payloads (citations, transcripts, server labels,
statuses). Canonical fields and provider metadata do not duplicate the same
raw field. A provider concept graduates to a typed field once it is a
cross-provider semantic we compute and consumers filter on.

`finishReason` is `{ type, raw }`: provider vocabularies (OpenAI
`finish_reason`, Anthropic `stop_reason`, Gemini `finishReason`, AI-SDK
variants) canonicalize to
`stop | length | tool-calls | content-filter | error | other | unknown`,
with the provider's verbatim value kept in `raw`.

## How parsing works

Recognition is **shape-based** — the parser never dispatches on a provider
label, because real payloads are mixed-dialect (AI-SDK and Anthropic blocks
in one message, LangChain wrapping OpenAI). Provider vocabulary lives in
per-provider `IOConvention` objects under `conventions/providers/<name>/`
(typed part handlers, envelope unwraps, root containers, tool-definition
recognizers, role/finish-reason maps); `core/` holds the generic pipeline
and folds over the registry in `conventions/index.ts`, ordered common
providers first. Adding a provider is a directory plus one registry entry —
core never changes. The pipeline:

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
   `system | user | assistant | tool` with deliberate
   coercions: `model → assistant`, deprecated `function → tool` (name becomes
   the tool name), role-less Responses reasoning items → `assistant` (model
   output even in replayed input history), user messages consisting solely of
   tool results → `tool`, tool-labeled turns without a `tool_call_id` →
   assistant call batches or tool-results (the content _is_ the tool's
   response), unrecognized declared roles (multi-agent frameworks putting the
   agent name in the role field) → the contextual fallback role with the raw
   string preserved as `senderName`. `senderName` otherwise carries an
   explicit participant `name` (OpenAI/LangChain).
4. **Part normalization.** Per message: content arrays/parts run through the
   part parser; string content splits into interleaved text and file parts
   around embedded media tokens; JSON-string arrays of tool shapes parse into
   tool parts. Sibling fields fold in: `tool_calls` (+
   `additional_kwargs.tool_calls`), `invalid_tool_calls` (flagged), Anthropic
   `thinking` arrays, OpenAI `refusal`/`audio`/`annotations`, Responses
   reasoning `summary`/`encrypted_content`, `finish_reason` (message-level,
   envelope-level, or `response_metadata`). The part parser itself
   recognizes, in order: shared typed blocks (text, reasoning), the
   provider-declared typed blocks (OpenAI, Anthropic, AI-SDK block types,
   including provider-executed built-in items), untyped keyed parts (Gemini
   `functionCall`, `inlineData`, `executableCode`, bare `{text}` with
   `thought`/`thoughtSignature`), shape-sniffed tool calls without a
   recognized type, and finally the `data`/`custom` fallback. Messages that produce no parts
   but have no message keys become single `data`-part messages (JSON
   passthrough) rather than being dropped.
5. **Accumulation.** Within one message, the first carrier of a tool call wins,
   so the same call in both `content` and `tool_calls` is not added twice.
   Repeated calls in input history remain. Output deduplicates calls by name and arguments. A call present in both input and output remains
   on both sides. Tool definitions merge by name with first-seen-wins per field
   across input → output → metadata.

## Semantics and invariants

Each entry states the behavior, why, and how to challenge it. Challenge by
fixture: add a failing case to the test suite, then either the behavior falls
or the fixture documents it.

### Tool calls

- **Duplicate carriers are not duplicate calls.** If one message exposes the
  same call in `content` and `tool_calls`, the first carrier wins. Identical
  calls within one carrier or in different input messages remain valid calls.
- **Output dedup remains output-only.** It uses `toolCallId`, falling
  back to the raw name + arguments. Input history is not globally deduplicated,
  and the same call may survive once in input and once in output.
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
- **No provider label on the result.** One span routinely mixes dialects, so
  an observation-level label would either echo span metadata (redundant —
  consumers already have `gen_ai.system`/`ls_provider`/model columns) or make
  a wrong claim about mixed content. Labels come from span metadata; per-part
  dialect traces exist via `toolType` and providerMetadata keys;
  round-tripping uses the raw `span`.
- **`tool` stays a role.** Turns carry the protocol rhythm; the `tool-result`
  part carries the semantics — tool messages are not collapsed into the
  preceding assistant turn.
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
  payloads verbatim. Anchor-less references (eg AI-SDK `source` parts) stay
  stream-positioned as `custom {kind: "source"}` — one vocabulary, two
  carriers, matching what the source actually provides.
- **`SpanIO.metadata` may carry an `attributes` record with OTel keys**;
  known tool-definition attribute keys are mined from it, each by the
  provider convention that owns it (`ai.prompt.tools` — AI SDK,
  `gen_ai.tool.definitions` / `llm.tools.N.…` — GenAI,
  `model_request_parameters.function_tools` — Pydantic AI).
- **Role** Unrecognized declared roles fall back to the contextual role (`user`
  on` input, assistant on output) with the raw string preserved as senderName.
  The parser does not correlate role strings with known tool names, so such
  turns surface as regular messages, not tool turns.

### Intentional losses

- LangChain `tool_call_chunks` (streaming deltas, redundant with parsed
  `tool_calls` on final messages).
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

- `projections/tool-call-columns.ts` — `NormalizedIO` → the legacy ClickHouse
  `tool_definitions`/`tool_calls`/`tool_call_names` column format.
- `projections/eval-record.ts` — `NormalizedIO` + observation → eval-ready
  record (input/output message split, output-side tool calls).
