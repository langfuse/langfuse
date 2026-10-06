import {
  type NormalizedMessage,
  type NormalizedMessagePart,
  type ToolCallPart,
  type ToolResultPart,
} from "@langfuse/shared/src/utils/normalized-io";

export type TranscriptMessageGroup<T extends NormalizedMessage> =
  | { type: "message"; message: T }
  | {
      type: "tool";
      message: T;
      call: ToolCallPart;
      result: ToolResultPart;
    }
  | { type: "tool"; message: T; call: ToolCallPart; result: null }
  | { type: "tool"; message: T; call: null; result: ToolResultPart };

/** Only pair unique, ordered IDs; keep unmatched tool parts as standalone rows. */
export function groupTranscriptMessages<T extends NormalizedMessage>(
  messages: readonly T[],
): TranscriptMessageGroup<T>[] {
  const calls = new Map<
    string,
    { part: ToolCallPart; position: number; count: number }
  >();
  const results = new Map<
    string,
    {
      part: ToolResultPart;
      message: T;
      position: number;
      partCount: number;
      count: number;
    }
  >();
  let position = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "tool-call" && part.toolCallId) {
        const previous = calls.get(part.toolCallId);
        calls.set(part.toolCallId, {
          part,
          position,
          count: (previous?.count ?? 0) + 1,
        });
      } else if (part.type === "tool-result" && part.toolCallId) {
        const previous = results.get(part.toolCallId);
        results.set(part.toolCallId, {
          part,
          message,
          position,
          partCount: 1,
          count: (previous?.count ?? 0) + 1,
        });
      }
      position++;
    }
  }

  position = 0;
  for (const [index, message] of messages.entries()) {
    const resultPosition = position;
    position += message.parts.length;
    if (message.role !== "tool" || message.source !== "output") continue;
    if (
      message.parts.length === 0 ||
      !message.parts.every((part) => part.type === "text")
    )
      continue;
    const previous = messages[index - 1];
    if (previous?.role !== "assistant" || previous.source !== "output")
      continue;
    const previousCalls = previous.parts.filter(
      (part) => part.type === "tool-call",
    );
    if (previousCalls.length !== 1) continue;
    const call = previousCalls[0]!;
    if (!call.toolCallId || calls.get(call.toolCallId)?.count !== 1) continue;
    if (results.has(call.toolCallId)) continue;
    results.set(call.toolCallId, {
      part: {
        type: "tool-result",
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: message.parts.map((part) => part.text).join("\n"),
      },
      message,
      position: resultPosition,
      partCount: message.parts.length,
      count: 1,
    });
  }

  const pairs = new Map<
    number,
    { call: ToolCallPart; result: ToolResultPart; message: T }
  >();
  const consumedResults = new Set<number>();
  for (const [id, call] of calls) {
    const result = results.get(id);
    if (
      call.count !== 1 ||
      result?.count !== 1 ||
      result.position <= call.position
    )
      continue;
    pairs.set(call.position, {
      call: call.part,
      result: result.part,
      message: result.message,
    });
    for (let offset = 0; offset < result.partCount; offset++) {
      consumedResults.add(result.position + offset);
    }
  }

  const groups: TranscriptMessageGroup<T>[] = [];
  position = 0;
  for (const message of messages) {
    let parts: NormalizedMessagePart[] = [];
    let changed = false;
    const flush = () => {
      if (parts.length)
        groups.push({ type: "message", message: { ...message, parts } });
      parts = [];
    };
    for (const part of message.parts) {
      const pair = pairs.get(position);
      if (pair) {
        changed = true;
        flush();
        groups.push({ type: "tool", ...pair });
      } else if (consumedResults.has(position)) {
        changed = true;
      } else if (part.type === "tool-call") {
        changed = true;
        flush();
        groups.push({ type: "tool", message, call: part, result: null });
      } else if (part.type === "tool-result") {
        changed = true;
        flush();
        groups.push({ type: "tool", message, call: null, result: part });
      } else {
        parts.push(part);
      }
      position++;
    }
    if (changed) flush();
    else groups.push({ type: "message", message });
  }
  return groups;
}
