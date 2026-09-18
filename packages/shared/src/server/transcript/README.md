# Transcript

PLEASE DO NOT USE IN PRODUCTION YET. This is a v1 implementation of the transcript builder and remains work in progress.

Builds a conversation transcript from the observations of one trace, or of
every trace in one session.

Status: generation-led builder with tool responses matched by ID or name and order.

- Tool outputs contribute only when matched to a preceding generation output's tool call in the same trace.
- Root span I/O and unmatched tool observations are excluded.

## Interface

```ts
orderObservations(observations: Observation[]): Observation[];
assembleTranscript(orderedObservations: Observation[]): Transcript | null;

type Transcript = { threads: Thread[] };

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

Consumers load the domain `Observation`s (see `domain/observations.ts`)
themselves, order them with `orderObservations`, and hand them to
`assembleTranscript`, which consumes the given order and returns `null` when
no eligible generations produce messages. The trace view does this in
`loadTraceTranscript` (web, next to the `events.transcriptByTraceId`
procedure): it reads the trace through `getObservationsForTraceFromEventsTable`,
the same repository function and time bounds the trace tree uses, once for the
structure of every observation without I/O and once for the `GENERATION` and
`TOOL` observations with I/O, and merges the two by id.

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

The builder first produces one flat list of messages per thread, each tagged
with the observation and trace that first emitted it. At the very end, one
cut is made in that list. Everything before the cut is `conversationHistory`,
everything after it is `currentTurn`. Two rules decide where the cut goes.

**Rule A: cut between traces.** Every message knows its trace. The last trace
that contributed is the current one, so the cut goes right after the last
message from any earlier trace. With a single trace, every message belongs to
the same trace and rule A does nothing. Callers are expected to supply one
trace at a time; the fixtures test never builds a whole session.

**Rule B: cut inside the replayed input.** Take the current trace's messages
before its first output message. That is what the first generation received as
input. Among them, find the last message from the assistant or from a tool:
it ended the previous turn. The cut goes right after it. Without an assistant
or tool message there, nothing is cut.

One trace with one generation:

```
input:   User: Refund my order.
         Assistant: [refund call]
         Tool: Refund succeeded.
         Assistant: Your refund is complete.   <- last assistant/tool before output
         User: When will it arrive?
output:  Assistant: Within five business days.
```

Rule A does nothing. Rule B cuts after "Your refund is complete". The four
messages above the cut become `conversationHistory`, without provenance. The
last two become `currentTurn.messages`, with provenance.
`currentTurn.observations` lists only observations that emitted one of them.

Two consequences of "last assistant or tool" rather than "last user":

- A fresh conversation starts with `[System, User]`. There is no assistant
  message, so nothing is cut and the system prompt stays with the turn.
- Replayed input without any assistant or tool message looks like new input
  and stays in the current turn. Two user messages sent in a row both stay in
  the turn.

## Which observations contribute?

- `GENERATION` observations with a non-null trace ID establish threads.
- Include `TOOL` observations in the supplied observations to recover responses.
  Match normalized tool-result IDs first. Without an ID, match the observation's
  exact name to the earliest preceding call not yet claimed by a tool observation
  with that tool name in the same trace. No parent constraint or fuzzy matching.
  Unknown explicit IDs do not fall back to names; unmatched tools are skipped.
  Preserve all normalized output parts; tool inputs are ignored. Provider-specific
  payload interpretation belongs to normalized IO, not the transcript builder.
- The caller supplies observations from one trace or session, already in
  transcript order (see Ordering).
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
├── index.ts               public surface: assembleTranscript, orderObservations, types
├── ordering.ts            orderObservations, the trace tree walk
├── ordering.test.ts       ordering rules
├── transcript.ts          assembleTranscript
├── threads.ts             thread selection and message deduplication
├── tool-calls.ts          tool matching and response association
├── types.ts               Transcript, Thread, Turn, ThreadMessage
└── fixtures/
    ├── README.md          how to turn a trace JSON export into a fixture
    ├── fixture-types.ts   TranscriptFixture
    ├── format-transcript.ts  chat-shaped printout used by the test
    ├── index.ts           registry: trace-scoped and session-scoped fixtures
    ├── fixtures.test.ts   structural checks and behavior assertion per fixture
    ├── trace/             one file per trace-scoped fixture
    └── session/           one file per session-scoped fixture
```

## Fixtures and verification

Fixtures contain observation trees and an expected transcript. The test builds
every trace on its own and concatenates the threads in trace order, so a
session fixture pins one history/current-turn split per trace. The fixture
whose expectation is still deferred is skipped in the behavior test; its
printed output is for manual review until the desired behavior is decided.

Run with console output enabled to see it:

```bash
pnpm --filter @langfuse/shared run test src/server/transcript --disableConsoleIntercept
```
