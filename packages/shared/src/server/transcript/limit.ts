import type { NormalizedMessage } from "../../utils/normalized-io";
import type { Thread, ThreadMessage, Transcript } from "./types";

type Entry = { threadIndex: number } & (
  | { kind: "history"; message: NormalizedMessage }
  | { kind: "current"; message: ThreadMessage }
);

function shorten(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let end = limit - 1;
  // Keep UTF-16 surrogate pairs intact before the omission marker.
  if (end > 0 && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return `${text.slice(0, end)}…`;
}

function shortenMessage<T extends NormalizedMessage>(
  message: T,
  limit: number,
): T {
  return {
    ...message,
    parts: message.parts.map((part) => {
      if (part.type === "text")
        return { ...part, text: shorten(part.text, limit) };
      if (part.type === "reasoning" && part.content.kind === "text") {
        // Provider metadata can carry signatures too; keep it with the original text.
        if (part.content.signature || part.providerMetadata) return part;
        return {
          ...part,
          content: { ...part.content, text: shorten(part.content.text, limit) },
        };
      }
      return part;
    }),
  };
}

function largestFitting(max: number, fits: (value: number) => boolean): number {
  let low = 0;
  let high = max;
  while (low < high) {
    const middle = low + Math.ceil((high - low) / 2);
    if (fits(middle)) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** Bound the public JSON shape after matching; structured payloads remain atomic. */
export function limitTranscript(
  transcript: Transcript,
  maxCharacters: number,
): Transcript | null {
  if (JSON.stringify(transcript).length <= maxCharacters) return transcript;

  const entries: Entry[] = transcript.threads.flatMap((thread, threadIndex) => [
    ...thread.conversationHistory.map(
      (message): Entry => ({ threadIndex, kind: "history", message }),
    ),
    ...thread.currentTurn.messages.map(
      (message): Entry => ({ threadIndex, kind: "current", message }),
    ),
  ]);
  const build = (selected: Entry[], textLimit: number): Transcript | null => {
    if (!selected.length) return null;
    const threads = new Map<number, Thread>();
    for (const entry of selected) {
      let thread = threads.get(entry.threadIndex);
      if (!thread) {
        thread = {
          conversationHistory: [],
          currentTurn: { messages: [], observations: [] },
        };
        threads.set(entry.threadIndex, thread);
      }
      if (entry.kind === "history")
        thread.conversationHistory.push(
          shortenMessage(entry.message, textLimit),
        );
      else
        thread.currentTurn.messages.push(
          shortenMessage(entry.message, textLimit),
        );
    }
    for (const [index, thread] of threads) {
      const contributors = new Set(
        thread.currentTurn.messages.map(({ observationId, traceId }) =>
          JSON.stringify([observationId, traceId]),
        ),
      );
      thread.currentTurn.observations = transcript.threads[
        index
      ].currentTurn.observations.filter(({ id, traceId }) =>
        contributors.has(JSON.stringify([id, traceId])),
      );
    }
    return { threads: [...threads.values()], truncated: true };
  };
  const fits = (selected: Entry[], textLimit: number) =>
    JSON.stringify(build(selected, textLimit)).length <= maxCharacters;
  // An indivisible payload or identifier must not crowd out other messages.
  const eligible = entries.filter((entry) => fits([entry], 1));
  const boundaries = (count: number) => [
    ...eligible.slice(0, Math.ceil(count / 2)),
    ...eligible.slice(eligible.length - Math.floor(count / 2)),
  ];
  // Reserve useful text before deciding how many messages can fit. Preserve
  // the beginning and end of the conversation when the middle must be omitted.
  let count = largestFitting(eligible.length, (size) =>
    fits(boundaries(size), 64),
  );
  if (!count)
    count = largestFitting(eligible.length, (size) =>
      fits(boundaries(size), 1),
    );
  if (!count) return null;
  const selected = boundaries(count);
  const textLimit = largestFitting(maxCharacters, (size) =>
    fits(selected, Math.max(1, size)),
  );
  return build(selected, Math.max(1, textLimit));
}
