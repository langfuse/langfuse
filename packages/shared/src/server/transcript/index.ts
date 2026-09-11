import type { Observation } from "../../domain";
import type { NormalizedMessage } from "../../utils/normalized-io";
import { normalizeIO } from "../normalized-io";
import type {
  Thread,
  ThreadMessage,
  Transcript,
  TranscriptConfig,
} from "./types";

export type * from "./types";

type Generation = Observation & { traceId: string };

const isRelevantObservation = (
  observation: Observation,
): observation is Generation =>
  observation.type === "GENERATION" && observation.traceId !== null;

const byStartTime = (a: Observation, b: Observation) =>
  a.startTime.getTime() - b.startTime.getTime();

/**
 * JSON with object keys in sorted order, so two structurally equal values
 * serialize to the same string regardless of property order. `undefined`
 * entries are dropped, matching `JSON.stringify`.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);

  return `{${entries.join(",")}}`;
}

/**
 * Identity of a message independent of where it was observed. A message the
 * model emitted as output reappears as input history in every later
 * generation of the loop; both sightings must collapse onto one transcript
 * entry. `source` and the output-only `finishReason` therefore stay out of
 * the key.
 */
const messageKey = (message: NormalizedMessage): string =>
  stableStringify([message.role, message.senderName ?? null, message.parts]);

type KeyedMessage = { message: NormalizedMessage; key: string };

type ThreadBuilder = {
  thread: Thread;
  /** Keys of every message already placed on the thread. */
  seen: Set<string>;
  /**
   * Key of the last non-system message on the thread. A generation whose
   * input replays this message continues the thread. System messages never
   * anchor, because the same system prompt recurs across unrelated
   * generations.
   */
  anchor: string | null;
};

const openThread = (): ThreadBuilder => ({
  thread: { messages: [], generationIds: [], traceIds: [] },
  seen: new Set(),
  anchor: null,
});

/** Threads indexed by their current anchor key. */
type AnchorIndex = Map<string, ThreadBuilder[]>;

function indexAnchor(index: AnchorIndex, builder: ThreadBuilder) {
  if (builder.anchor === null) return;
  const bucket = index.get(builder.anchor);
  if (bucket) bucket.push(builder);
  else index.set(builder.anchor, [builder]);
}

function unindexAnchor(index: AnchorIndex, builder: ThreadBuilder) {
  if (builder.anchor === null) return;
  const bucket = index.get(builder.anchor)?.filter((b) => b !== builder);
  if (!bucket || bucket.length === 0) index.delete(builder.anchor);
  else index.set(builder.anchor, bucket);
}

/**
 * The thread a generation continues: the one whose anchor appears among the
 * generation's non-system input messages. Exactly one match continues that
 * thread; zero or several matches mean the generation opens a new one.
 */
function findContinuation(
  input: KeyedMessage[],
  index: AnchorIndex,
): ThreadBuilder | null {
  const candidates = new Set<ThreadBuilder>();
  for (const { message, key } of input) {
    if (message.role === "system") continue;
    for (const builder of index.get(key) ?? []) candidates.add(builder);
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}

/**
 * Appends the generation's unseen messages to the thread, input before
 * output, and moves the thread's anchor to the last non-system message.
 */
function place(
  builder: ThreadBuilder,
  generation: Generation,
  messages: KeyedMessage[],
  index: AnchorIndex,
) {
  const { thread, seen } = builder;
  thread.generationIds.push(generation.id);
  if (!thread.traceIds.includes(generation.traceId)) {
    thread.traceIds.push(generation.traceId);
  }

  let anchor = builder.anchor;
  for (const { message, key } of messages) {
    if (seen.has(key)) continue;
    seen.add(key);

    const threadMessage: ThreadMessage = {
      ...message,
      generationId: generation.id,
      traceId: generation.traceId,
    };
    thread.messages.push(threadMessage);
    if (message.role !== "system") anchor = key;
  }

  if (anchor !== builder.anchor) {
    unindexAnchor(index, builder);
    builder.anchor = anchor;
    indexAnchor(index, builder);
  }
}

/**
 * Builds a transcript from generations only. Generations are walked in start
 * order across every trace in the input. Each one is normalized, then either
 * continues the thread whose last message it replays or opens a new thread.
 * Within a thread a message is placed the first time it is seen and skipped
 * on every repeat.
 */
export function getTranscript(
  observations: Observation[],
  config: TranscriptConfig = {},
): Transcript | null {
  const includeSystemMessages =
    config.includeSystemMessages !== undefined
      ? config.includeSystemMessages
      : true;

  const generations = observations
    .filter(isRelevantObservation)
    .sort(byStartTime);
  if (generations.length === 0) return null;

  const builders: ThreadBuilder[] = [];
  const anchors: AnchorIndex = new Map();

  for (const generation of generations) {
    const { messages } = normalizeIO({
      kind: "io",
      io: {
        input: generation.input,
        output: generation.output,
        metadata: generation.metadata,
      },
    });

    const keyed: KeyedMessage[] = messages
      .filter((message) => includeSystemMessages || message.role !== "system")
      .map((message) => ({ message, key: messageKey(message) }));
    const input = keyed.filter(({ message }) => message.source === "input");

    let builder = findContinuation(input, anchors);
    if (!builder) {
      builder = openThread();
      builders.push(builder);
    }
    place(builder, generation, keyed, anchors);
  }

  return { threads: builders.map((builder) => builder.thread) };
}
