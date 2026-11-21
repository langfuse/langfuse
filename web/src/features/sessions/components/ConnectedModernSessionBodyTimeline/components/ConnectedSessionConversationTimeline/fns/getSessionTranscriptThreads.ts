import { type RouterOutputs } from "@/src/utils/api";

export function getSessionTranscriptThreads(
  transcript: RouterOutputs["events"]["transcriptByTraceId"]["transcript"],
  includeNestedThreads = false,
) {
  const indexedThreads = (transcript?.threads ?? []).map(
    (thread, threadIndex) => ({ thread, threadIndex }),
  );
  const nonEmptyThreads = indexedThreads.filter(
    ({ thread }) => thread.currentTurn.messages.length > 0,
  );
  const candidateThreads =
    nonEmptyThreads.length > 0 ? nonEmptyThreads : indexedThreads;
  const shallowestLevel = candidateThreads.reduce(
    (level, { thread }) => Math.min(level, thread.currentTurn.nestingLevel),
    Infinity,
  );
  const visibleThreads = candidateThreads.filter(
    ({ thread }) =>
      includeNestedThreads ||
      thread.currentTurn.nestingLevel === shallowestLevel,
  );
  return {
    visibleThreads,
    hiddenThreadCount: candidateThreads.length - visibleThreads.length,
  };
}
