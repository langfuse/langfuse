import { useTraceDetailData } from "@/src/components/trace/useTraceDetailData";

type UsePeekDataProps = {
  projectId: string;
  traceId?: string;
  timestamp?: Date;
};

/**
 * Peek's trace-data hook — a thin wrapper over the shared
 * {@link useTraceDetailData} so the peek and the standalone trace page fetch
 * through one place. Callers read `data` / `isLoading`.
 */
export const usePeekData = ({
  projectId,
  traceId,
  timestamp,
}: UsePeekDataProps) => useTraceDetailData({ projectId, traceId, timestamp });
