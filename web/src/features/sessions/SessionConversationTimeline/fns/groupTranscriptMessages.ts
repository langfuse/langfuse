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
    { part: ToolResultPart; position: number; count: number }
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
          position,
          count: (previous?.count ?? 0) + 1,
        });
      }
      position++;
    }
  }

  const pairs = new Map<
    number,
    { call: ToolCallPart; result: ToolResultPart }
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
    pairs.set(call.position, { call: call.part, result: result.part });
    consumedResults.add(result.position);
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
        groups.push({ type: "tool", message, ...pair });
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
