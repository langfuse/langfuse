import { api } from "@/src/utils/api";

type UsePeekDataProps = {
  projectId: string;
  traceId?: string;
  timestamp?: Date;
};

export const usePeekData = ({
  projectId,
  traceId,
  timestamp,
}: UsePeekDataProps) => {
  return api.traces.byIdWithObservationsAndScores.useQuery(
    {
      traceId: traceId as string,
      projectId,
      timestamp,
    },
    {
      enabled: !!traceId,
      retry(failureCount, error) {
        if (error.data?.code === "UNAUTHORIZED") return false;
        return failureCount < 3;
      },
      staleTime: 60 * 1000, // 1 minute
    },
  );
};
