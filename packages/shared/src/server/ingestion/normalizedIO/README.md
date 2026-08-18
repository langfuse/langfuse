# [DEV DRAFT] Normalized I/O parser

One parser owns observation I/O interpretation. Adapters turn a transport
format (OTel span, ClickHouse event record) into `SpanIO`; `normalizeIO`
turns `SpanIO` into `NormalizedIO`; projections derive consumer shapes
(ClickHouse tool columns, eval records) from `NormalizedIO` — never from the
raw formats.

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
