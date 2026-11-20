import { type RouterOutputs } from "@/src/utils/api";

type TranscriptThread = NonNullable<
  RouterOutputs["events"]["transcriptByTraceId"]["transcript"]
>["threads"][number];

// The base message shape shared by current-turn messages and replayed history.
type TranscriptMessage = TranscriptThread["conversationHistory"][number];

// The session view shows a conversation with a model, not a classifier's structured output.
function isConversationalThread(thread: TranscriptThread) {
  // The user message may come from replayed history, but the assistant reply
  // must come from the current turn: a guardrail replaying an earlier
  // exchange would otherwise qualify as conversational too.
  const messages = [
    ...thread.currentTurn.messages,
    ...thread.conversationHistory,
  ];
  return (
    messages.some(
      (message) => message.role === "user" && hasReadablePart(message),
    ) &&
    thread.currentTurn.messages.some(
      (message) =>
        message.role === "assistant" &&
        hasReadablePart(message) &&
        !isJsonOnlyMessage(message),
    )
  );
}

function hasReadablePart(message: TranscriptMessage) {
  return message.parts.some(
    (part) =>
      (part.type === "text" &&
        part.text.trim() !== "" &&
        !isJsonText(part.text)) ||
      part.type === "file",
  );
}

// A text part is JSON when it parses as a JSON object or array, e.g. a
// classifier verdict returned as a string instead of structured data.
function isJsonText(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}

// A message is JSON-only when every remaining part, after excluding reasoning parts, is data or custom.
function isJsonOnlyMessage(message: TranscriptMessage) {
  const parts = message.parts.filter((part) => part.type !== "reasoning");
  return (
    parts.length > 0 &&
    parts.every((part) => part.type === "data" || part.type === "custom")
  );
}

export function getSessionTranscriptThreads(
  transcript: RouterOutputs["events"]["transcriptByTraceId"]["transcript"],
  includeNestedThreads = false,
) {
  const threads = transcript?.threads ?? [];
  const indexedThreads = threads.map((thread, threadIndex) => ({
    thread,
    threadIndex,
  }));
  if (includeNestedThreads) {
    return { visibleThreads: indexedThreads, hiddenThreadCount: 0 };
  }
  const conversationalThreads = indexedThreads.filter(({ thread }) =>
    isConversationalThread(thread),
  );
  const pool =
    conversationalThreads.length > 0 ? conversationalThreads : indexedThreads;
  const shallowestLevel = pool.reduce(
    (level, { thread }) => Math.min(level, thread.currentTurn.nestingLevel),
    Infinity,
  );
  const visibleThreads = pool.filter(
    ({ thread }) => thread.currentTurn.nestingLevel === shallowestLevel,
  );
  return {
    visibleThreads,
    hiddenThreadCount: threads.length - visibleThreads.length,
  };
}
