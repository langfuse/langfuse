# Transcript

PLEASE DO NOT USE IN PRODUCTION YET. This is a v1 implementation of the transcript builder and remains work in progress.

Builds a conversation transcript from the observations of one trace.

Status: generation-led builder with tool responses matched by ID or name and order.

- Tool outputs contribute only when matched to a preceding generation output's tool call in the same trace.
- Root span I/O and unmatched tool observations are excluded.

## Interface

```ts
orderObservations<T extends TranscriptObservation>(observations: T[]): Array<T & { nestingLevel: number }>;
assembleTranscript(
  orderedObservations: OrderedObservation[],
  options?: TranscriptOptions,
): Transcript | null;

type TranscriptOptions = {
  maxCharacters?: number;
  onTimings?: (timings: { normalizationMs: number; matchingMs: number }) => void;
};

type Transcript = { threads: Thread[]; truncated?: true };

type Thread = {
  conversationHistory: NormalizedMessage[]; // replayed from earlier turns, no provenance
  currentTurn: Turn;
};

type Turn = {
  nestingLevel: number;
  messages: ThreadMessage[];
  observations: { id: string; traceId: string }[]; // observations that contributed, in order
};

type ThreadMessage = NormalizedMessage & {
  observationId: string; // observation that first emitted the message
  traceId: string;
  startTime: Date; // source observation start, not an individual message timestamp
  endTime: Date | null; // source observation end, when available
};
```

Consumers load observations themselves. `TranscriptObservation` requires only
`id`, `traceId`, `parentObservationId`, `type`, `name`, `startTime` (a `Date`),
`endTime` (a `Date` or `null`), `input`, `output` and `metadata`; full domain
`Observation`s also satisfy it.
Order them with `orderObservations` and hand them to
`assembleTranscript`, which consumes the given order and returns `null` when
no eligible generations produce messages. For one trace, read it through
`getObservationsForTraceFromEventsTable`, the same repository function and
time bounds the trace tree uses: once for the structure of every observation
without I/O, once for the `GENERATION` and `TOOL` observations with I/O, then
merge the two by id so the walk order comes from the structure and the
messages from the content.

### Why a trace renderer also needs observations

`assembleTranscript` returns normalized conversation threads, not a complete
trace. It retains the messages and minimal observation references needed to
connect them, but does not retain the fields a trace-level view needs:

- A root `SPAN` or `AGENT` can carry the trace input and final application
  output, including output produced after the last model or tool call. Those
  fields are absent from the assembled conversation.
- Non-generation operations, unmatched tool observations, and observation
  type/name/level/status are not represented as conversation messages. A
  renderer needs them to show the operation sequence and inline failures.
- Available tool definitions can occur in generation input or metadata. They
  are not part of the normalized messages returned by the assembler.

The Topics renderer therefore accepts both the assembled transcript and the
already loaded, ordered observations. It uses the transcript for roles, threads,
replayed history, and matched tool results; it uses observations for trace-level
context and for locating messages among operations. This adds no repository
read. If other consumers need the same trace context, an explicit optional
context field or richer observation references on the assembled result could
remove that second input. Such an extension should keep conversation assembly
and trace-level facts distinct, so root I/O and operation metadata do not become
duplicate conversation messages.

## Execution issues

`assembleTranscriptContext(orderedObservations, options?)` composes
`assembleTranscript` with execution-issue collection over the same observations
and returns `{ transcript, executionIssues }`, or `null` when there is no
transcript. `Transcript` stays purely conversational.

An execution issue is an ERROR observation, or a WARNING observation with a
status message (`isExecutionIssue`). Issues are collected from all supplied
observations, including ones that contribute no messages, in observation order.
Each keeps its observation reference, type, name, level, start time and the
first 1,000 characters of its status message, so a consumer can place it in the
matching observation block. `maxCharacters` limits only the transcript; issues
are not capped.

## Schema

`schema.ts` owns the current transcript shape and composes the message/part schemas
from `utils/normalized-io/schema.ts`. `types.ts` infers the output types from those
schemas; assembly inputs and options remain separate. Assembly does not parse
each intermediate object at runtime.

Persisted trace-batch inputs have their own frozen schemas and serialization
adapters under [`../traceBatch`](../traceBatch/README.md). They version the
complete storage envelope, including the transcript and trace context.
The transcript fixture suite validates the current assembled shape independently
of that storage format.

## Character limit

`assembleTranscript(observations, { maxCharacters: 10_000 })` guarantees
`JSON.stringify(result).length <= 10_000`. The limit counts UTF-16 code units,
including JSON escaping, provenance, provider metadata and the truncation marker.
It must be a safe integer of at least 4, the serialized length of `null`.
Omitting it preserves the complete transcript and existing assembly behavior.

Limiting happens after normalization, matching and turn splitting. Text and
unsigned textual enrichment without provider metadata can be shortened with an
ellipsis; identifiers, tool arguments/results, media, signed enrichment and other structured fields
stay intact. Messages that cannot fit even with shortened text are omitted.
When too many messages remain, the beginning and end are retained, preserving
their order and history/current-turn partition. Contributor references are
pruned to the retained current-turn messages. The original current turn
nesting level is preserved.

Changed results include `truncated: true`. If no message fits, the result is
`null`. Truncated transcripts are partial evidence, not a replayable conversation:
a tool call and its result can be separated by omitted messages. This bounds
serialized output, not input size or normalization work. Timing callbacks exclude
the limiting pass.

## Ordering

The transcript walks observations the way the trace tree does: depth first,
with roots and siblings by start time. That differs from plain start-time order
when a span that started earlier contains a generation that started later than
a sibling span's generation. `orderObservations` produces this order from the
full structure, following the web tree builder's rules: one row per id with the
earliest start winning, and a row whose parent is missing becomes a root. The
assembler never sorts; callers, including the fixtures test, order first.

A **transcript** contains the conversation threads inferred from the supplied
observations. A **thread** is a sequence of messages connected by shared input
history; it can span multiple traces. The consumer handles multiple threads
and decides which, if any, is the main conversation.

## Conversation history and current turn

A trace is one turn. The input its generations replay from earlier turns, up
to and including the last assistant or tool message before the trace's first
output, is `conversationHistory` without provenance; everything after it is
`currentTurn`, each message with the observation that emitted it.

`currentTurn.nestingLevel` is the tree depth of its first contributing generation,
with fetched roots at zero. It is not a parent/child relationship between threads;
later, deeper generations do not change it. Missing parents make observations roots.

```
input:   User: Refund my order.
         Assistant: [refund call]
         Tool: Refund succeeded.
         Assistant: Your refund is complete.   <- conversation history ends here
         User: When will it arrive?
output:  Assistant: Within five business days.
```

## Which observations contribute?

- `GENERATION` observations with a non-null trace ID establish threads.
- Include `TOOL` observations in the supplied observations to recover responses.
  Match normalized tool-result IDs first. Without an ID, match the observation's
  exact name to the earliest preceding call not yet claimed by a tool observation
  with that tool name in the same trace. No parent constraint or fuzzy matching.
  Unknown explicit IDs do not fall back to names; unmatched tools are skipped.
  Preserve all normalized output parts; tool inputs are ignored. Provider-specific
  payload interpretation belongs to normalized IO, not the transcript builder.
- The caller supplies one trace's observations, already in transcript order
  (see Ordering).
- Each observation is normalized once in this ordered pass. Generations
  establish threads and register output tool-call IDs; tools enrich registered
  calls. Input messages are processed before output messages for generations.
- Generations producing no messages are skipped and do not create empty threads.
- Each registered tool call has at most one tool result response. A tool observation with a
  response adds or replaces it immediately after the originating call message,
  referencing the tool's `observationId` and
  `traceId`. Later generation replay cannot overwrite it or add another copy.
  If multiple tool observations respond to one call, the first response wins.
  Tool inputs do not contribute. Other observation types are ignored.

The main loop has two paths: generations select a thread, append deduplicated
input and append output; tool observations enrich an existing call. Call
registration and replayed-result suppression happen inside message appending.

## How does deduplication work?

### 1. Select a thread

Compare generation messages by role and identity parts. Continue a thread
when all its non-system messages with identity parts appear in the incoming
input, regardless of message order. At least one such message must match: system
messages and enrichment alone cannot establish continuity. Attached tool
responses are not required. Otherwise create a new thread. Matching checks
presence, not occurrence counts.
When several threads match, the most recently created matching thread wins.

Instrumentation should capture the full input and output of each model call,
including enrichment. Thread matching tolerates missing or changed enrichment and
provider annotations; it still requires matching text, tool calls, and arguments.

### 2. Append messages

Messages compare **role + allowlisted part fields** (see `comparison.ts`).
Provider annotations (`providerMetadata`, `providerExecuted`) and provenance are
ignored. Tool arguments and JSON results are compared in full. Object-property
order is ignored; array order matters.
Prepared messages reuse `identityKey` and `enrichmentKey` during selection and replay.

- **Inputs:** append only occurrences beyond the number already shown in the
  thread, so replayed history disappears but additional identical copies survive (eg user responds "Thank you" twice).
- **Outputs:** always append, then count them so subsequent inputs do not repeat them.
- **Enrichment:** compare all enrichment parts in a message as one ordered group,
  counted by role and content within the thread. Preserve enrichment in new messages;
  on replay, retain only additional occurrences of the whole group. A changed group
  is retained in full, without deduplicating its individual parts. Newly seen
  enrichment in a repeated message is appended on
  its own with the input observation's provenance; it does not duplicate the
  accompanying text or calls or rewrite an earlier output. The same history/current
  turn split applies to these messages.
- **Registered tool responses:** use call identity, not message occurrence counts.
  Across traces, reused call IDs are matched by call occurrence in complete,
  ordered input history. Ambiguous partial replays remain as input messages.
  Tool-observation responses take precedence over generation-provided responses.
  These responses are excluded from thread matching, irrespective of their source.
- **References:** each message has a reference to the trace and generation ID of the object that emitted it. Replayed inputs never overwrite references on earlier occurrences.

### System messages

- Exclude system messages when deciding which thread matches. Compare the
  remaining conversation messages.
- Once the thread is selected, include new system messages there. Keep their
  first-seen generation and trace IDs.
- Apply the same occurrence-count deduplication to system messages within that thread.
- Preserve changed system messages as separate entries, rather than overwriting
  earlier instructions or combining their contents.

## Supported cases

- Cumulative history across generations and traces, including previous outputs
  replayed as inputs.
- Reordered history: an existing `[A, B, C]` matched against input
  `[B, C, A, New]` adds only `New`. Existing display order stays `[A, B, C]`.
- Additional identical input occurrences and always-visible outputs.
- New system instructions within a continuing conversation.
- Missing or changed enrichment in otherwise matching history.
- Multiple threads when their histories distinguish them.

## Current limitations

- **Compaction or missing history:** can split a conversation into multiple threads.
- **Embedded history:** a conversation inside one string or object is not matched
  against separate messages.
- **Identical conversations:** unrelated conversations with matching history can join.
- **Whole-message matching:** equivalent content split into different messages
  or parts may not match. Reordering parts within a message also changes identity.
  Splitting or regrouping enrichment can retain repeated enrichment content.
  Registered tool responses are the exception: replay is matched by call ID
  within the thread (and occurrence for reused IDs), even when grouped with other parts.
- **Name matching is best-effort:** same-name parallel executions can start in a
  different order from their calls. Names must match exactly. Metadata-only IDs
  are not read by the transcript builder; they require support in normalized IO.
- **Performance:** replayed history is normalized and serialized for each
  generation.

## Preliminary decisions

- Tool observations contribute to thread messages rather than just enriching generation messages with tool responses. In some cases, the generations messages do not contain any reference of the tool call or the tool result, but tool-observations can provide this information. Recommendation: let tool observations only enrich generation messages with tool responses. Sampled production data does not show strong enough evidence to support this change. Should we find more evidence in production data, this decision should be revisited.
- Root span I/O does not contribute to the transcript, unless it is of type `GENERATION`.
- Do not include status messages and errors in the transcript for v1. Only revisit should we find strong evidence in production data that this is a valuable feature, or if consumers (e.g. Topics, Session UI) require this information.
- Expose a helper method to get the first user message and final assistant message from a given thread. This is useful for consumers (e.g. Topics, Session UI) to display the user question and final assistant answer. Consumers must assess for which thread they want to display this information, and how to handle multiple threads.

## Open questions

- How should compacted histories and branches reconnect to existing threads? Will venture to find solid examples in production data to guide this decision.

## Layout

```
transcript/
├── README.md
├── index.ts               public surface: assembly, renderers, types
├── topics-renderer.ts     Topics trace-level layout
├── topics-renderer-config.ts  Topics block caps and inclusions
├── topics-renderer.test.ts    Topics layout behavior
├── generic-renderer.ts    preserved plain-text comparison layout
├── ordering.ts            orderObservations, the trace tree walk
├── ordering.test.ts       ordering rules
├── transcript.ts          assembleTranscript
├── context.ts             assembleTranscriptContext and execution issues
├── limit.ts               optional hard limit on serialized JSON
├── comparison.ts          messageKey
├── comparison.test.ts     focused equality regressions
├── messages.ts            message preparation and part classification
├── continuity.ts          contributesToContinuity
├── replay.ts              createMessageDeduplicator
├── threads.ts             thread selection and message appending
├── tool-calls.ts          tool matching and response association
├── schema.ts              current transcript shape, composing normalized message schemas
├── types.ts               inferred output types, assembly inputs and options
└── fixtures/
    ├── fixture-types.ts   TranscriptFixture
    ├── index.ts           registry of fixtures
    ├── fixtures.test.ts   exact fixture expectations and assembly/cap regressions
    └── trace/             one file per fixture
```

## Fixtures and verification

Each fixture is one trace with an expected transcript, which the test asserts
as a whole. Fixtures whose generations replay earlier turns pin the split
between conversation history and current turn.

Run the fixture and ordering regressions:

```bash
pnpm --filter @langfuse/shared run test src/server/transcript
```

`currentTurn.nestingLevel` is the observation-tree depth of the first GENERATION
that contributes retained messages to the current turn. All ancestor types count;
fetched roots and observations with missing parents are level 0. Cyclic rows
that cannot be reached by the tree walk also use level 0. Earlier conversation
history, replay-only generations, later generations, and TOOL contributors do
not determine the value. Ordering attaches depth without changing source observations.
