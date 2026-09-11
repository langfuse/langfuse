# Transcript

Builds a conversation transcript from the observations of one trace, or of
every trace in one session. `normalized-io` interprets a single observation;
this module decides which observations contribute and how their normalized
messages combine into threads.

Status: generation-only builder. Tool observations do not contribute yet.

## Interface

```ts
getTranscript(
  observations: Observation[],
  config?: TranscriptConfig,
): Transcript | null;

type TranscriptConfig = {
  includeSystemMessages?: boolean; // default true
};

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
the repositories produce from ClickHouse rows. Returns `null` when no
generation is present.

## Semantics

- Only `GENERATION` observations with a trace id contribute. Every other type
  is ignored.
- Generations are walked in start order across all traces in the input. Each
  one runs through `normalizeIO`; its messages are considered input first,
  then output.
- A message is identified by role, sender name, and parts. `source` and
  `finishReason` are not part of the identity, so an output message that
  later reappears as replayed input history collapses onto its first
  sighting.
- Threads are built from shared input history, not from trace boundaries.
  Every thread has an anchor: the key of its last non-system message. A
  generation continues a thread when one of its non-system input messages is
  that anchor. Exactly one matching thread continues it; zero or several
  matches open a new thread. A later trace that replays the history of an
  earlier one therefore extends the same thread.
- Within a thread a message is placed the first time it is seen and skipped
  on every repeat. Placing moves the anchor to the last non-system message.
- System messages never anchor, since the same system prompt recurs across
  unrelated generations. With `includeSystemMessages: false` they are dropped
  before placement.
- The consumer picks the main thread (first opened, most messages, ...).

Open questions the fixtures are meant to answer:

- Tool results often exist only on `TOOL` observations and are missing from
  the generation I/O. How they join the thread, and whether hierarchy matters.
- Compaction of long histories.
- Whether status messages and error indications become transcript content.
- How to pick the user question and the final assistant answer out of a
  thread.

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
