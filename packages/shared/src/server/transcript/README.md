# Transcript

Builds a conversation transcript from the observations of one trace, or of
every trace in one session.

Status: generation-only builder.

- Other observation types do not contribute yet.
- Root span I/O and standalone tool observations are excluded.

## Interface

```ts
getTranscript(
  observations: Observation[]
): Transcript | null;

type Transcript = { threads: Thread[] };

type Thread = {
  messages: ThreadMessage[];
  generationIds: string[]; // generations that contributed, in order
  traceIds: string[]; // distinct traces of those generations, in order
};

type ThreadMessage = NormalizedMessage & {
  generationId: string; // observation that first emitted the message
  traceId: string;
};
```

The input is the domain `Observation` (see `domain/observations.ts`), which
the repositories produce from ClickHouse rows. Returns `null` when there are
no eligible generations produce messages.

A **transcript** contains the conversation threads inferred from the supplied
observations. A **thread** is a sequence of messages connected by shared input
history; it can span multiple traces. The consumer handles multiple threads
and decides which, if any, is the main conversation.

## Which observations contribute?

- Only `GENERATION` observations with a non-null trace ID contribute.
- The caller supplies observations from one trace or session. The builder
  orders generations by start time across the supplied traces.
- Each generation runs through `normalizeIO`; input messages are processed
  before output messages.
- Generations producing no messages are skipped and do not create empty threads.
- Root spans, standalone tool observations and other observation types do not
  contribute, even when they contain I/O. Tool content within generation I/O
  can contribute through normalization.

## How does deduplication work?

### 1. Select a thread

Continue a thread when it has at least one non-system message and all its
non-system messages appear in the incoming input, regardless of order.
Otherwise create a new thread. Matching checks presence, not occurrence counts.
When several threads match, the most recently created matching thread wins.

### 2. Append messages

A message is identified by stable JSON of **role + parts**. Object-property
order is ignored; array order matters. `senderName`, `source`, `finishReason`
and observation provenance are excluded. All fields inside parts are included.

- **Inputs:** append only occurrences beyond the number already shown in the
  thread, so replayed history disappears but additional identical copies survive (eg user responds "Thank you" twice).
- **Outputs:** always append, then count them so subsequent inputs do not repeat them.
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
- **Performance:** replayed history is normalized and serialized for each
  generation.

## Open questions

- Should root-span I/O and standalone tool observations contribute? How do we
  avoid duplicating generation content, and does hierarchy matter?
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
