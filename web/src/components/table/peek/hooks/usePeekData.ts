import { useTraceDetailData } from "@/src/features/traces";

type UsePeekDataProps = {
  projectId: string;
  traceId?: string;
  timestamp?: Date;
  aggregationLevel?: "trace" | "session";
  readPath?: "v3" | "v4";
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
  aggregationLevel,
  readPath,
}: UsePeekDataProps) =>
  useTraceDetailData({
    projectId,
    traceId,
    timestamp,
    aggregationLevel,
    readPath,
  });
