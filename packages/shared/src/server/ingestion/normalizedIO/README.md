# [DEV DRAFT] Normalized I/O parser

One parser owns observation I/O interpretation. Adapters turn a transport
format (OTel span, ClickHouse event record) into `SpanIO`; `normalizeIO`
turns `SpanIO` into `NormalizedIO`; projections derive consumer shapes
(ClickHouse tool columns, eval records) from `NormalizedIO` — never from the
raw formats.

## Validation status

- Fixture registry (`fixtures/`): 12 fixtures across Vercel AI SDK, OpenAI
  chat completions + Responses API, LangGraph, Microsoft Agent Framework,
  Pydantic AI, Semantic Kernel, Gemini, and raw passthrough shapes; parser
  output locked per fixture, tool-column projection asserted against the
  same locked output.
- Legacy compatibility: with the (temporary) hookup of
  `toToolColumns(normalizeIO(...))` into `normalizeToolsForObservation`,
  53/54 of the legacy `extractToolsBackend` worker tests pass. The one
  divergence (unnamed provider tools, see questions) is under review.
- Prod replay: sampled prod OTel batches replayed through the read-only
  consistency harness; the parser's tool columns diffed against the
  actually-ingested ClickHouse baseline
  (`scripts/compareToolColumnsAgainstManifest.ts`). Known win: spans whose
  tool calls live in `parts[].type: "tool_call"` containers are missed by
  the live pipeline and correctly extracted here — internal example from langfuse emo trace:
  https://cloud.langfuse.com/project/clkpwwm0m000gmm094odg11gi/traces/5f9b96b2d186c0cd172bc93272bf6f68?observation=a661aa3c1be83d6a

## What's left

1. **OTel → SpanIO adapter**: extract the raw input/output/metadata
   discovery out of `OtelIngestionProcessor.extractInputAndOutput` /
   `extractMetadata` into `adapters/otel.ts`, with the processor calling in.
2. **How to deal with empty strings**: Proposal implementation: messages whose only
   content is an empty string are dropped. TBD how to handle non-string `text` values
   — align with the trace IO view, which renders both.
3. **Messages/metadata confidence**: use prod replay against the
   ChatML parser tests, same method as the tool-column comparison.
4. **Projection coverage**: tests for `toEvalRecord`. Other projects have been tested.
5. **Rollout**: across product surfaces. Start with ingestion, continue with evals.

## Questions for review

1. **Interface structure**: The current interface still exposes IO extraction (OTel or ClickHouse → SpanIO)
   and normalization (SpanIO → NormalizedIO), as individually callable; callers to coordinate both steps.
   We are considering a single input-format-aware wrapper that returns both SpanIO and NormalizedIO.
   This would clearly preserve which source and semantic adapters were used (extensible with schema version or confidence).
   Discuss sign-off on `NormalizedIO` / the part union in
   `types.ts`, and on `source: "input" | "output"`.
2. **Unnamed provider tools**: the parser admits provider tools without a
   `name` (e.g. `web_search_preview`) into `tool_definitions`; the legacy
   extractor excludes them. Keep (available-tool filtering covers provider
   tools too) or match legacy?
3. **Anything else** missing — consumers, semantics, or rollout concerns not
   covered here?

## Assumptions

Each entry states the assumption, why it holds, and how to challenge it.
Challenge by fixture: add a failing case to the test suite, then either the
assumption falls or the fixture documents it.

### 1. Tool-call dedup is scoped to one side; a call in output always counts

Tool-call parts are deduplicated by `toolCallId` (fallback: name + input)
within input and within output separately — never across the boundary. A
call appearing in this observation's output is always kept there (and so
always reaches the tool columns), even when the input echoes the same id.

- **Why:** instrumentation frequently reports the same call twice on one
  side (in a message's `tool_calls` field and again as a content part), so
  per-side dedup is needed. Across sides, this matches the trace IO view —
  `combineInputOutputMessages` concatenates without dedup — and the legacy
  column extractor, which scans only output.
- **Known consequence (accepted):** outputs that echo the full message
  history (full-state outputs) attribute historical calls to this
  observation. The trace view and the legacy extractor share this behavior;
  changing it would be a deliberate, separate semantics change.
- **Challenge with:** a fixture where the same call id appears in both input
  and output — output must retain it.

### 2. Tool columns count only output-side calls

`toToolColumns` (and the eval record's `toolCalls`) include only calls from
`source: "output"` messages: "calls this observation made", not history it
was shown. Matches the legacy extractor, which never scans input for calls.

- **Why:** the columns power called-tool-name filters and per-observation
  call counts; a call in input was made by an earlier observation.
- **Challenge with:** any consumer that needs history calls — that consumer
  should read `NormalizedIO.messages`, not the columns.

### 3. `source` preserves the input/output boundary in one ordered stream

Messages carry `source: "input" | "output"` instead of living in two arrays;
input messages precede output messages, original order preserved within each.

- **Why:** rendering wants one conversation stream; projections (eval
  records, tool columns) need the boundary back.
- **Note:** not yet part of the canonical normalized-IO format; proposed
  extension.

### 4. The trace-UI ChatML parser is the recognition oracle; placement is the column arbiter

If the trace IO view (ChatML parser + framework-trace corpus) recognizes a
shape as a tool call, it is one — recognition gaps in the legacy extractor
(e.g. `parts[].type: "tool_call"` containers) are treated as legacy bugs,
and diverging from legacy there is intentional. Whether a recognized call
belongs in the tool _columns_ is decided solely by where it sits (input vs
output), per assumption 2.

- **Challenge with:** a shape the ChatML corpus renders as a tool call that
  the parser misses, or vice versa.

### 5. Tool definitions merge by name, first-seen wins per field

Definitions from input, output, and metadata are merged by tool name;
earlier occurrences keep their fields, later ones only fill gaps.

- **Why:** the same tool is frequently declared in multiple places with
  varying completeness (name-only in a message, full schema in metadata).

### 6. JSON strings are parsed once, by their owner

Every value crosses at most one JSON-string boundary per owner; nested
encoded strings are decoded by whichever step consumes them, not eagerly.

- **Why:** double-encoded payloads are common; eager deep-parsing corrupts
  values that are legitimately strings.

### 7. Absent tool-call ids are `null`; columns map them to `""`

The parser emits `toolCallId: null` when instrumentation provides no id; the
column projection converts `null` to `""` for byte-compatibility with the
legacy ClickHouse format.

### 8. `SpanIO.metadata` may carry an `attributes` record with OTel keys

The parser mines known tool-definition attribute keys from
`metadata.attributes` (`ai.prompt.tools`, `gen_ai.tool.definitions`,
`llm.tools.N.tool.json_schema`, `model_request_parameters.function_tools`).

- **Why:** both adapters (OTel ingestion, ClickHouse event record) store
  span attributes under `metadata.attributes`, so the parser can treat that
  shape as part of the `SpanIO` contract rather than transport knowledge.
- **Tension (open):** these are OTel-format key names inside the
  "transport-independent" core. Alternative: move attribute mining into the
  adapters and have them surface definitions explicitly.

### 9. Id-less identical parallel calls collapse

Two distinct calls to the same tool with identical arguments and no ids
dedup to one (key: name + input). The legacy extractor behaves the same
(`id || name-arguments`), so parity holds — but real parallel duplicate
calls are undercounted by both.
