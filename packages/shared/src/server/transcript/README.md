# Transcript

PLEASE DO NOT USE IN PRODUCTION YET. This is a v1 implementation of the transcript builder and remains work in progress.

Builds a conversation transcript from the observations of one trace.

Status: generation-led builder with tool responses matched by ID or name and order.

- Tool outputs contribute only when matched to a preceding generation output's tool call in the same trace.
- Root span I/O and unmatched tool observations are excluded.

## Interface

```ts
orderObservations<T extends TranscriptObservation>(observations: T[]): T[];
assembleTranscript(
  orderedObservations: TranscriptObservation[],
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
  messages: ThreadMessage[];
  observations: { id: string; traceId: string }[]; // observations that contributed, in order
};

type ThreadMessage = NormalizedMessage & {
  observationId: string; // observation that first emitted the message
  traceId: string;
};
```

Consumers load observations themselves. `TranscriptObservation` requires only
`id`, `traceId`, `parentObservationId`, `type`, `name`, `startTime` (a `Date`),
`input`, `output` and `metadata`; full domain `Observation`s also satisfy it.
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

## Character limit

`assembleTranscript(observations, { maxCharacters: 10_000 })` guarantees
`JSON.stringify(result).length <= 10_000`. The limit counts UTF-16 code units,
including JSON escaping, provenance, provider metadata and the truncation marker.
It must be a safe integer of at least 4, the serialized length of `null`.
Omitting it preserves the complete transcript and existing assembly behavior.

Limiting happens after normalization, matching and turn splitting. Text and
unsigned textual reasoning without provider metadata can be shortened with an
ellipsis; identifiers, tool arguments/results, media, signed reasoning and other structured fields
stay intact. Messages that cannot fit even with shortened text are omitted.
When too many messages remain, the beginning and end are retained, preserving
their order and history/current-turn partition. Contributor references are
pruned to the retained current-turn messages.

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

Continue a thread when it has at least one non-system message and all its
non-system generation messages appear in the incoming input, regardless of order.
Supplemental tool responses are not required for this match.
Otherwise create a new thread. Matching checks presence, not occurrence counts.
When several threads match, the most recently created matching thread wins.

### 2. Append messages

A message is identified by stable JSON of **role + parts**. Object-property
order is ignored; array order matters. `senderName`, `source`, `finishReason`
and observation provenance are excluded. All fields inside parts are included.

- **Inputs:** append only occurrences beyond the number already shown in the
  thread, so replayed history disappears but additional identical copies survive (eg user responds "Thank you" twice).
- **Outputs:** always append, then count them so subsequent inputs do not repeat them.
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
- Multiple threads when their histories distinguish them.

## Current limitations

- **Compaction or missing history:** can split a conversation into multiple threads.
- **Embedded history:** a conversation inside one string or object is not matched
  against separate messages.
- **Identical conversations:** unrelated conversations with matching history can join.
- **Whole-message matching:** equivalent content split into different messages
  or parts may not match. Reordering parts within a message also changes identity.
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
- Differences in part-level `providerMetadata` prevents deduplication when the visible message content is otherwise identical. Should production data show strong enough evidence to support this change, this decision should be revisited.

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
├── limit.ts               optional hard limit on serialized JSON
├── threads.ts             thread selection and message deduplication
├── tool-calls.ts          tool matching and response association
├── types.ts               Transcript, Thread, Turn, ThreadMessage
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
