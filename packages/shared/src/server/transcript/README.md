# Transcript

Builds a conversation transcript from the observations of one trace, or of
every trace in one session.

Status: generation-led builder with explicitly linked tool responses.

- Tool outputs contribute only when matched to a generation output's tool-call ID in the same trace.
- Root span I/O and unmatched tool observations are excluded.

## Interface

```ts
getTranscript(
  observations: Observation[]
): Transcript | null;

type Transcript = { threads: Thread[] };

type Thread = {
  messages: ThreadMessage[];
  observations: { id: string; traceId: string }[]; // observations that contributed, in order
};

type ThreadMessage = NormalizedMessage & {
  observationId: string; // observation that first emitted the message
  traceId: string;
};
```

The input is the domain `Observation` (see `domain/observations.ts`), which
the repositories produce from ClickHouse rows. Returns `null` when no eligible
generations produce messages.

A **transcript** contains the conversation threads inferred from the supplied
observations. A **thread** is a sequence of messages connected by shared input
history; it can span multiple traces. The consumer handles multiple threads
and decides which, if any, is the main conversation.

## Which observations contribute?

- `GENERATION` observations with a non-null trace ID establish threads.
- Include `TOOL` observations in the supplied observations to recover responses.
  An explicit tool observation's call ID must match a generation output's tool-call ID in the same trace.
  Missing IDs, unmatched tools, and tools encountered before their calling
  generation are skipped. There is no hierarchy, name or timestamp fallback.
- The caller supplies observations from one trace or session. The builder
  orders generations and tools by start time across the supplied traces.
- Each observation is normalized once in this chronological pass. Generations
  establish threads and register output tool-call IDs; tools enrich registered
  calls. Input messages are processed before output messages for generations.
- Generations producing no messages are skipped and do not create empty threads.
- Each registered call has at most one response. A tool observation with a
  response adds or replaces it, referencing the tool's `observationId` and
  `traceId`. Later generation replay cannot overwrite it or add another copy.
  If multiple tool observations respond to one call, the first response wins.
  Tool inputs do not contribute. Other observation types are ignored.

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
  within the same trace, even when grouped with other parts.
- **Unmatched tools:** responses without a matching explicit call ID are skipped.
  There is no hierarchy-based fallback, and tool inputs do not contribute.
- **Performance:** replayed history is normalized and serialized for each
  generation.

## Open questions

- Should tool observations also contribute tool inputs, or only enrich
  generations with responses as they do now? Reconstructing calls from tool
  inputs and supporting tools without explicit call IDs remain future work.
- Should root-span I/O contribute without duplicating generation content?
- How should compacted histories and branches reconnect to existing threads?
- Should status messages and errors become transcript content?
- How should consumers select the user question and final assistant answer
  rather than all intermediate generations?
- Should differences in part-level `providerMetadata` prevent deduplication
  when the visible message content is otherwise identical? They currently do.

## Layout

```
transcript/
├── README.md
├── index.ts               getTranscript
├── types.ts               TranscriptConfig, Transcript, Thread, ThreadMessage
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

Fixtures contain observation trees and an optional expected transcript.
**Fixtures with `expected: undefined` exercise parsing and structural checks,
but do not verify transcript correctness.** Their printed output is for manual
review; expectations are authored by hand once the desired behavior is decided.

Run with console output enabled to see it:

```bash
pnpm --filter @langfuse/shared run test src/server/transcript --disableConsoleIntercept
```
