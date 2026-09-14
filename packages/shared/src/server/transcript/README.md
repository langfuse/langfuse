# Transcript

Builds a conversation transcript from the observations of one trace, or of
every trace in one session. `normalized-io` interprets a single observation;
this module decides which observations contribute and how their normalized
messages combine into threads.

Status: generation-only builder. Tool observations do not contribute yet.

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
the repositories produce from ClickHouse rows. Returns `null` when no transcript can be built.

## Semantics

- Cumulative history: Show only the new question and answer; replayed messages disappear.
- Threads may span multiple traces: Threads are built from shared input history, not from trace boundaries. A generation continues a thread if it's input contains all the current thread's messages.
- Message references tracked: Within a thread, each message stores the generation and trace ID that first emitted it.
- Reordered history: [A, B, C] → [B, C, A, New] adds only New; order-insensitive history reconciliation.
- Repeated messages: show input occurrences beyond the number already shown in the thread. Always show outputs and count them for subsequent input deduplication.
- System messages:
  - Exclude system messages when deciding which thread matches. Compare the remaining conversation messages.
  - Once the thread is selected, include new system messages there. Keep their first-seen generation and trace IDs.
  - Apply the same occurrence-count deduplication to system messages within that thread.
  - Preserve changed system messages as separate entries, rather than overwriting the earlier one or combining their contents in the underlying data.

### Edge cases:

- Deduplication compares whole messages, not individual parts.
- An identical new input without cumulative history can still be mistaken for replay; occurrence counts cannot distinguish intent.
- System messages: transcript shows which distinct instructions appeared and where they first appeared

### Open questions the fixtures are meant to answer:

- Tool results often exist only on `TOOL` observations and are missing from
  the generation I/O. How they join the thread, and whether hierarchy matters.
- Whether status messages and error indications become transcript content.
- If/How to pick the user question and the final assistant answer out of a
  thread.
- Consideration if we should include root observation output?

## Working with the Interface

- The consumer picks the main thread (first opened, most messages, ...).
- The consumer is expected to handle multiple threads.

## Implementation

- Only `GENERATION` observations with a trace id contribute. Every other type
  is ignored.
- Generations are walked in start order across all traces in the input. Each
  one runs through `normalizeIO`; its messages are considered input first,
  then output.
- A message is identified by role and parts. `senderName`, `source`, and
  `finishReason` are not part of the identity, so an output message that
  later reappears as replayed input history collapses onto its first
  sighting.
- Stable JSON keys are computed once per normalized message, sorting object
  properties recursively while preserving array order. Keys exclude provenance.
- Each thread tracks how many copies of a message have been shown. Each input
  starts a temporary occurrence count: only occurrences beyond the shown count
  are appended. Outputs are always appended and increment the shown count.
  Replayed inputs retain the provenance of the previously emitted messages.
- Thread selection remains order-insensitive and checks presence, not occurrence
  counts. System messages do not select a thread. Counts are isolated per thread.

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

Each fixture ships a full observation tree, an optional `config`, and an
`expected` transcript. Expectations are written by hand once the semantics
for a case are decided; until then they stay `undefined` and the test only
prints the transcript. Run with console output enabled to see it:

```bash
pnpm --filter @langfuse/shared run test src/server/transcript --disableConsoleIntercept
```
