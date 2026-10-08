import { type RouterOutputs } from "@/src/utils/api";
import { getSessionTranscriptThreads } from "./getSessionTranscriptThreads";

export function getSessionConversationEntries(
  traces: readonly {
    trace: { id: string };
    transcript:
      | RouterOutputs["events"]["transcriptByTraceId"]["transcript"]
      | undefined;
  }[],
) {
  const visibility = traces.map(({ transcript }) =>
    getSessionTranscriptThreads(transcript ?? null),
  );
  const useThreadNumbers = visibility.some(
    ({ visibleThreads }) => visibleThreads.length > 1,
  );
  return traces.flatMap(({ trace, transcript }, traceIndex) => {
    const { visibleThreads } = visibility[traceIndex]!;
    const threads = visibleThreads.length
      ? visibleThreads
      : [{ threadIndex: undefined }];
    return threads.map(({ threadIndex }, visibleIndex) => ({
      itemId:
        threadIndex === undefined ? trace.id : `${trace.id}:${threadIndex}`,
      traceIndex,
      threadIndex,
      threadCount: transcript === undefined ? undefined : visibleThreads.length,
      threadNumber:
        useThreadNumbers && threadIndex !== undefined
          ? visibleIndex + 1
          : undefined,
      displayNumber:
        useThreadNumbers && threadIndex !== undefined
          ? `${traceIndex + 1}.${visibleIndex + 1}`
          : String(traceIndex + 1),
      isFirstThread: visibleIndex === 0,
    }));
  });
}
