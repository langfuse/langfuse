import { type RouterOutputs } from "@/src/utils/api";

export function getSessionTranscriptThreads(
  transcript: RouterOutputs["events"]["transcriptByTraceId"]["transcript"],
) {
  const threads = transcript?.threads ?? [];
  const shallowestLevel = threads.reduce(
    (level, thread) => Math.min(level, thread.currentTurn.nestingLevel),
    Infinity,
  );
  const visibleThreads = threads
    .map((thread, threadIndex) => ({ thread, threadIndex }))
    .filter(
      ({ thread }) => thread.currentTurn.nestingLevel === shallowestLevel,
    );
  return {
    visibleThreads,
    hiddenThreadCount: threads.length - visibleThreads.length,
  };
}
