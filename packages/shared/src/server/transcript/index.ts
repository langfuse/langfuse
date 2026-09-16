import { partition } from "lodash";
import type { Observation } from "../../domain";
import type { NormalizedMessage } from "../../utils/normalized-io";
import { normalizeIO } from "../normalized-io";
import type { Thread, ThreadMessage, Transcript } from "./types";
export type * from "./types";

type Generation = Observation & { traceId: string };

type KeyedMessage = {
  message: NormalizedMessage;
  key: string;
};
type ThreadState = {
  thread: Thread;
  messages: KeyedMessage[];
  shownCounts: Map<string, number>;
};

type RegisteredCall = {
  state: ThreadState;
  response?: ThreadMessage;
  fromTool?: boolean;
};
const callKey = (traceId: string, id: string) => JSON.stringify([traceId, id]);

/** Each call owns one response; a tool observation takes precedence. */
function setResponse(
  call: RegisteredCall,
  observation: Generation,
  part: NormalizedMessage["parts"][number],
) {
  const fromTool = observation.type === "TOOL";
  if (call.response && (!fromTool || call.fromTool)) return;
  const response: ThreadMessage = {
    role: "tool",
    source: "output",
    parts: [part],
    observationId: observation.id,
    traceId: observation.traceId,
  };
  if (call.response) {
    Object.assign(call.response, response);
  } else {
    call.state.thread.messages.push(response);
    call.response = response;
  }
  call.fromTool = fromTool;
  if (
    !call.state.thread.observations.some(
      ({ id, traceId }) =>
        id === observation.id && traceId === observation.traceId,
    )
  ) {
    call.state.thread.observations.push({
      id: observation.id,
      traceId: observation.traceId,
    });
  }
}

/** Remove registered results from ordinary message deduplication. */
function collectResponses(
  entries: KeyedMessage[],
  observation: Generation,
  calls: Map<string, RegisteredCall>,
  apply = true,
): KeyedMessage[] {
  return entries.flatMap((entry) => {
    const { message } = entry;
    const parts = message.parts.filter((part) => {
      if (part.type !== "tool-result" || !part.toolCallId) return true;
      const call = calls.get(callKey(observation.traceId, part.toolCallId));
      if (!call) return observation.type !== "TOOL";
      if (apply) setResponse(call, observation, part);
      return false;
    });
    if (!parts.length) return [];
    if (parts.length === message.parts.length) return [entry];
    const remaining = { ...message, parts };
    return [{ message: remaining, key: messageKey(remaining) }];
  });
}

/** Check if an observation is relevant for the transcript. */
const isRelevantObservation = (
  observation: Observation,
): observation is Generation =>
  (observation.type === "GENERATION" || observation.type === "TOOL") &&
  observation.traceId !== null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Object property order and observation provenance do not define identity. */
function messageKey(message: NormalizedMessage): string {
  return JSON.stringify(
    [message.role, message.parts],
    (_key, value: unknown) =>
      isRecord(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, value[key]]),
          )
        : value,
  );
}

/** Adapt tool output to a result message, then normalize the observation once. */
function normalize(generation: Generation) {
  const toolId =
    generation.metadata?.["attributes.gen_ai.tool.call.id"] ??
    generation.metadata?.["gen_ai.tool.call.id"];
  const isTool = generation.type === "TOOL";
  const { messages } = normalizeIO({
    kind: "io",
    io: {
      input: isTool ? undefined : generation.input,
      output: isTool
        ? typeof toolId === "string" &&
          toolId.length > 0 &&
          generation.output != null
          ? { role: "tool", tool_call_id: toolId, content: generation.output }
          : undefined
        : generation.output,
      metadata: generation.metadata,
    },
  });
  return partition(
    messages.map((message) => ({ message, key: messageKey(message) })),
    ({ message }) => message.source === "input",
  );
}

/** Find a thread that matches the input messages. */
function findThread(states: ThreadState[], input: KeyedMessage[]) {
  const inputKeys = new Set(input.map(({ key }) => key));
  return states.findLast(
    ({ messages }) =>
      messages.some(({ message }) => message.role !== "system") &&
      messages.every(
        ({ message, key }) => message.role === "system" || inputKeys.has(key),
      ),
  );
}

/** Append messages to a thread. */
function append(
  state: ThreadState,
  generation: Generation,
  input: KeyedMessage[],
  output: KeyedMessage[],
  isNewThread: boolean,
) {
  const { thread, shownCounts } = state;
  const messageCount = thread.messages.length;
  if (isNewThread) {
    // Append all input messages, no deduplication checks required
    for (const entry of input) appendMessage(state, generation, entry);
  } else {
    // Deduplicate input messages
    const inputCounts = new Map<string, number>();
    for (const entry of input) {
      const { key } = entry;
      const occurrence = (inputCounts.get(key) ?? 0) + 1;
      inputCounts.set(key, occurrence);
      if (occurrence > (shownCounts.get(key) ?? 0)) {
        appendMessage(state, generation, entry);
      }
    }
  }
  // Append all output messages
  for (const entry of output) appendMessage(state, generation, entry);
  if (
    thread.messages.length > messageCount &&
    !thread.observations.some(
      ({ id, traceId }) =>
        id === generation.id && traceId === generation.traceId,
    )
  ) {
    thread.observations.push({
      id: generation.id,
      traceId: generation.traceId,
    });
  }
}

function appendMessage(
  { thread, messages, shownCounts }: ThreadState,
  generation: Generation,
  { message, key }: KeyedMessage,
) {
  const emitted = {
    ...message,
    observationId: generation.id,
    traceId: generation.traceId,
  };
  thread.messages.push(emitted);
  messages.push({ message: emitted, key });
  shownCounts.set(key, (shownCounts.get(key) ?? 0) + 1);
}

/** Normalize generations, reconcile history, and retain first-seen provenance. */
export function getTranscript(observations: Observation[]): Transcript | null {
  const ordered = observations
    .filter(isRelevantObservation)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const states: ThreadState[] = [];
  const calls = new Map<string, RegisteredCall>();

  for (const generation of ordered) {
    const [input, output] = normalize(generation);
    if (generation.type === "TOOL") {
      collectResponses(output, generation, calls);
      continue;
    }
    if (input.length === 0 && output.length === 0) continue;

    // Registered responses do not participate in thread selection.
    const history = collectResponses(input, generation, calls, false);
    let state = findThread(states, history);
    const isNewThread = !state;
    if (!state) {
      // Open new thread
      state = {
        thread: { messages: [], observations: [] },
        messages: [],
        shownCounts: new Map(),
      };
      states.push(state);
    }
    for (const { message } of output) {
      for (const part of message.parts) {
        if (part.type !== "tool-call" || !part.toolCallId) continue;
        const key = callKey(generation.traceId, part.toolCallId);
        if (!calls.has(key)) calls.set(key, { state });
      }
    }
    const remainingInput = collectResponses(input, generation, calls);
    // Append the call before placing its response.
    const remainingOutput = collectResponses(output, generation, calls, false);
    append(state, generation, remainingInput, remainingOutput, isNewThread);
    collectResponses(output, generation, calls);
  }

  return states.length ? { threads: states.map(({ thread }) => thread) } : null;
}
