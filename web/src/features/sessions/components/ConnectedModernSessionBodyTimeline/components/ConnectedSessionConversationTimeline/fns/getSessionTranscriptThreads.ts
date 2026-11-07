import { type RouterOutputs } from "@/src/utils/api";

export function getSessionTranscriptThreads(
  transcript: RouterOutputs["events"]["transcriptByTraceId"]["transcript"],
  includeNestedThreads = false,
) {
  const threads = transcript?.threads ?? [];
  const nonEmptyIndexedThreads = threads
    .map((thread, threadIndex) => ({ thread, threadIndex }))
    .filter(({ thread }) => (thread.currentTurn?.messages?.length ?? 0) > 0);

  const shallowestLevel = nonEmptyIndexedThreads.reduce(
    (level, { thread }) => Math.min(level, thread.currentTurn.nestingLevel),
    Infinity,
  );

  const visibleThreads = nonEmptyIndexedThreads.filter(
    ({ thread }) =>
      includeNestedThreads ||
      thread.currentTurn.nestingLevel === shallowestLevel,
  );

  return {
    visibleThreads,
    hiddenThreadCount: nonEmptyIndexedThreads.length - visibleThreads.length,
  };
}
