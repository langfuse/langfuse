import { partition } from "lodash";
import type { OrderedObservation } from "@langfuse/shared/src/server/transcript/ordering";
import type { Transcript } from "@langfuse/shared/src/server/transcript/types";
import {
  append,
  createThread,
  findThread,
  messageKey,
  splitTurn,
  type ThreadState,
} from "@langfuse/shared/src/server/transcript/threads";
import { createToolCallRegistry } from "@langfuse/shared/src/server/transcript/tool-calls";
import {
  normalizeSpanIO,
  type NormalizedMessage,
} from "@langfuse/shared/src/utils/normalized-io";

// TODO: Look into moving session tool recovery into shared transcript assembly
// so normalized-output recovery does not need separate assembly orchestration.
export function assembleSessionTraceTranscript<T extends OrderedObservation>(
  observations: T[],
  transformOutput: (
    observation: T,
    messages: NormalizedMessage[],
  ) => NormalizedMessage[],
): Transcript | null {
  const threads: ThreadState[] = [];
  const toolCalls = createToolCallRegistry();
  for (const observation of observations.filter(
    (observation): observation is T & { traceId: string } =>
      (observation.type === "GENERATION" || observation.type === "TOOL") &&
      observation.traceId !== null,
  )) {
    const { messages } = normalizeSpanIO({
      input: observation.type === "TOOL" ? undefined : observation.input,
      output: observation.output,
      metadata: observation.metadata,
    });
    const [inputMessages, outputMessages] = partition(
      messages,
      (message) => message.source === "input",
    );
    const [input, output] = partition(
      [...inputMessages, ...transformOutput(observation, outputMessages)].map(
        (message) => ({ message, key: messageKey(message) }),
      ),
      ({ message }) => message.source === "input",
    );
    if (observation.type === "TOOL") {
      toolCalls.attachToolOutput(observation, output);
      continue;
    }
    if (input.length === 0 && output.length === 0) continue;
    let thread = findThread(threads, input);
    if (!thread) {
      thread = createThread();
      threads.push(thread);
    }
    append(thread, observation, input, output, toolCalls);
  }
  return threads.length ? { threads: threads.map(splitTurn) } : null;
}
