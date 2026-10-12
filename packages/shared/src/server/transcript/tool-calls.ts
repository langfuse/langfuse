import type {
  NormalizedMessage,
  ToolCallPart,
  ToolResultPart,
} from "../../utils/normalized-io";
import type { ThreadMessage } from "./types";
import {
  addContributor,
  type EmittedMessage,
  type KeyedMessage,
  type ThreadState,
  type TranscriptObservation,
} from "./threads";

type Call = {
  part: ToolCallPart;
  thread: ThreadState;
  message: ThreadMessage;
  response?: ThreadMessage;
  fromTool?: boolean;
};
type Part = NormalizedMessage["parts"][number];
const key = (traceId: string, id: string) => JSON.stringify([traceId, id]);

export type ToolCallRegistry = ReturnType<typeof createToolCallRegistry>;

export function createToolCallRegistry() {
  const calls = new Map<string, Call>();
  const callsByThread = new WeakMap<ThreadState, Map<string, Call[]>>();
  const pending = new Map<string, { calls: Call[]; next: number }>();
  const responseTails = new WeakMap<ThreadMessage, ThreadMessage>();

  function register(
    observation: TranscriptObservation,
    part: ToolCallPart,
    thread: ThreadState,
    message: ThreadMessage,
  ) {
    const id = part.toolCallId
      ? key(observation.traceId, part.toolCallId)
      : undefined;
    if (id && calls.has(id)) return;

    const call: Call = { part, thread, message };
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
      startTime: observation.startTime,
      endTime: observation.endTime,
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

  /**
   * Resolve which tool results of one generation belong to registered calls
   * before any of its messages is emitted.
   */
  function forGeneration(
    thread: ThreadState,
    observation: TranscriptObservation,
    input: KeyedMessage[],
    output: KeyedMessage[],
  ) {
    // Input results of a resolved call; output results resolve on attach.
    const claimed = new Map<Part, Call | undefined>();

    // Reused IDs need complete, ordered call history to disambiguate results.
    const totals = new Map<string, number>();
    for (const { message } of input) {
      for (const part of message.parts) {
        if (part.type === "tool-call" && part.toolCallId)
          totals.set(part.toolCallId, (totals.get(part.toolCallId) ?? 0) + 1);
      }
    }
    const occurrences = new Map<string, number>();
    const threadCalls = callsByThread.get(thread);
    for (const { message } of input) {
      for (const part of message.parts) {
        if (part.type === "tool-call" && part.toolCallId)
          occurrences.set(
            part.toolCallId,
            (occurrences.get(part.toolCallId) ?? 0) + 1,
          );
        if (part.type !== "tool-result" || !part.toolCallId) continue;

        const matches = threadCalls?.get(part.toolCallId);
        const total = totals.get(part.toolCallId) ?? 0;
        const occurrence = occurrences.get(part.toolCallId) ?? 0;

        let call: Call | undefined;
        if (matches?.length === 1 && total <= 1) {
          call = matches[0];
        } else if (matches && total === matches.length && occurrence > 0) {
          call = matches[occurrence - 1];
        } else {
          call = undefined;
        }

        if (call) claimed.set(part, call);
      }
    }

    // Output results attach to calls registered earlier, including by a
    // preceding part of the same generation's output.
    const outputCallIds = new Set<string>();
    for (const { message } of output) {
      for (const part of message.parts) {
        if (part.type === "tool-call" && part.toolCallId)
          outputCallIds.add(part.toolCallId);
        if (
          part.type === "tool-result" &&
          part.toolCallId &&
          (outputCallIds.has(part.toolCallId) ||
            calls.has(key(observation.traceId, part.toolCallId)))
        )
          claimed.set(part, undefined);
      }
    }

    return {
      claims: (part: Part) => claimed.has(part),
      /** Register an emitted output's tool calls as anchors for their responses. */
      register(message: EmittedMessage) {
        if (message.source !== "output") return;

        for (const part of message.parts) {
          if (part.type === "tool-call")
            register(observation, part, thread, message);
        }
      },
      attach(results: Part[]) {
        for (const part of results) {
          if (part.type !== "tool-result" || !part.toolCallId) continue;

          const call =
            claimed.get(part) ??
            calls.get(key(observation.traceId, part.toolCallId));
          if (call) setResponse(call, observation, [part]);
        }
      },
    };
  }

  function attachToolOutput(
    observation: TranscriptObservation,
    output: KeyedMessage[],
  ) {
    const parts = output.flatMap(({ message }) => message.parts);
    if (!parts.length) return;

    // Tool rows render JSON, not normalized media/custom parts. Consume those
    // parts with the response so they cannot leak into independent messages;
    // typed omission metadata points users back to the untouched observation.
    const omittedContent: NonNullable<ToolResultPart["omittedContent"]> = [];
    const mediaCount = parts.filter((part) => part.type === "file").length;
    const unsupportedCount = parts.filter(
      (part) =>
        part.type !== "text" &&
        part.type !== "data" &&
        part.type !== "tool-result" &&
        part.type !== "file",
    ).length;
    if (mediaCount) omittedContent.push({ kind: "media", count: mediaCount });
    if (unsupportedCount)
      omittedContent.push({ kind: "unsupported", count: unsupportedCount });

    let hasId = false;
    for (const part of parts) {
      if (part.type !== "tool-result" || !part.toolCallId) continue;

      hasId = true;
      const call = calls.get(key(observation.traceId, part.toolCallId));
      if (call)
        setResponse(call, observation, [
          {
            ...part,
            ...(omittedContent.length ? { omittedContent } : {}),
          },
        ]);
    }
    if (hasId || !observation.name) return;

    const queue = pending.get(key(observation.traceId, observation.name));
    if (!queue) return;

    while (queue.calls[queue.next]?.fromTool) queue.next++;
    const call = queue.calls[queue.next];
    if (call) {
      queue.next++;
      const content = parts.filter(
        (part) =>
          part.type === "text" ||
          part.type === "data" ||
          part.type === "tool-result",
      );
      const responseOutput = (() => {
        if (!content.length) return null;
        if (content.every((part) => part.type === "text")) {
          return content.map((part) => part.text).join("\n");
        }
        const values = content.map((part) => {
          if (part.type === "text") return part.text;
          if (part.type === "data") return part.value;
          return part.output;
        });
        return values.length === 1 ? values[0]! : values;
      })();
      setResponse(call, observation, [
        {
          type: "tool-result",
          toolCallId: call.part.toolCallId,
          toolName: call.part.toolName,
          output: responseOutput,
          ...(content.some(
            (part) => part.type === "tool-result" && part.isError,
          )
            ? { isError: true }
            : {}),
          ...(omittedContent.length ? { omittedContent } : {}),
        },
      ]);
    }
  }

  return { forGeneration, attachToolOutput };
}
