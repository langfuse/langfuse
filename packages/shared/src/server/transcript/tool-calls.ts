import type {
  NormalizedMessage,
  ToolCallPart,
} from "../../utils/normalized-io";
import type { Thread, ThreadMessage } from "./types";
import {
  addContributor,
  type KeyedMessage,
  type TranscriptObservation,
} from "./threads";

type Call = {
  thread: Thread;
  message: ThreadMessage;
  response?: ThreadMessage;
  fromTool?: boolean;
};
const key = (traceId: string, id: string) => JSON.stringify([traceId, id]);

export function createToolCallRegistry() {
  const calls = new Map<string, Call>();
  const callsByThread = new WeakMap<Thread, Map<string, Call[]>>();
  const pending = new Map<string, { calls: Call[]; next: number }>();
  const responseTails = new WeakMap<ThreadMessage, ThreadMessage>();

  function register(
    observation: TranscriptObservation,
    part: ToolCallPart,
    thread: Thread,
    message: ThreadMessage,
  ) {
    const id = part.toolCallId
      ? key(observation.traceId, part.toolCallId)
      : undefined;
    if (id && calls.has(id)) return;
    const call: Call = { thread, message };
    if (id) calls.set(id, call);
    if (part.toolCallId) {
      if (!callsByThread.has(thread)) callsByThread.set(thread, new Map());
      const threadCalls = callsByThread.get(thread)!;
      const matches = threadCalls.get(part.toolCallId) ?? [];
      matches.push(call);
      threadCalls.set(part.toolCallId, matches);
    }
    const name = key(observation.traceId, part.toolName);
    if (!pending.has(name)) pending.set(name, { calls: [], next: 0 });
    pending.get(name)!.calls.push(call);
  }

  function setResponse(
    call: Call,
    observation: TranscriptObservation,
    parts: NormalizedMessage["parts"],
  ) {
    const fromTool = observation.type === "TOOL";
    if (call.response && (!fromTool || call.fromTool)) return;
    const response: ThreadMessage = {
      role: "tool",
      source: "output",
      parts,
      observationId: observation.id,
      traceId: observation.traceId,
    };
    if (call.response) Object.assign(call.response, response);
    else {
      const anchor = responseTails.get(call.message) ?? call.message;
      call.thread.messages.splice(
        call.thread.messages.indexOf(anchor) + 1,
        0,
        response,
      );
      responseTails.set(call.message, response);
      call.response = response;
    }
    call.fromTool = fromTool;
    addContributor(call.thread, observation);
  }

  /** Register output calls or consume a result while its message is appended. */
  function consumePart(
    observation: TranscriptObservation,
    part: NormalizedMessage["parts"][number],
    thread: Thread,
    message: ThreadMessage,
    replayCalls: Map<string, number>,
    replayTotals: Map<string, number>,
  ): boolean {
    if (
      part.type === "tool-call" &&
      message.source === "input" &&
      part.toolCallId
    )
      replayCalls.set(
        part.toolCallId,
        (replayCalls.get(part.toolCallId) ?? 0) + 1,
      );
    if (part.type === "tool-call" && message.source === "output")
      register(observation, part, thread, message);
    if (part.type !== "tool-result" || !part.toolCallId) return false;
    const matches = callsByThread.get(thread)?.get(part.toolCallId);
    // Reused IDs need complete, ordered call history to disambiguate results.
    const occurrence = replayCalls.get(part.toolCallId) ?? 0;
    let call: Call | undefined;
    if (message.source === "output") {
      call = calls.get(key(observation.traceId, part.toolCallId));
    } else if (
      matches?.length === 1 &&
      (replayTotals.get(part.toolCallId) ?? 0) <= 1
    ) {
      call = matches[0];
    } else if (
      matches &&
      replayTotals.get(part.toolCallId) === matches.length &&
      occurrence > 0
    ) {
      call = matches[occurrence - 1];
    }
    if (!call) return false;
    setResponse(call, observation, [part]);
    return true;
  }

  function attachToolOutput(
    observation: TranscriptObservation,
    output: KeyedMessage[],
  ) {
    const parts = output.flatMap(({ message }) => message.parts);
    if (!parts.length) return;
    let hasId = false;
    for (const part of parts) {
      if (part.type !== "tool-result" || !part.toolCallId) continue;
      hasId = true;
      const call = calls.get(key(observation.traceId, part.toolCallId));
      if (call) setResponse(call, observation, [part]);
    }
    if (hasId || !observation.name) return;
    const queue = pending.get(key(observation.traceId, observation.name));
    if (!queue) return;
    while (queue.calls[queue.next]?.fromTool) queue.next++;
    const call = queue.calls[queue.next];
    if (call) {
      queue.next++;
      setResponse(call, observation, parts);
    }
  }

  return { consumePart, attachToolOutput };
}
