import { useRouter } from "next/router";
import { useCallback } from "react";
import { api } from "@/src/utils/api";

export const usePeekViewState = (projectId: string) => {
  const router = useRouter();
  const { peek, timestamp } = router.query;

  const setPeekView = useCallback(
    (id?: string, time?: Date) => {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);

      if (!id) {
        params.delete("peek");
        params.delete("timestamp");
        params.delete("observation");
      } else {
        params.set("peek", id);
        params.set("timestamp", time?.toISOString() ?? "");
        params.delete("observation");
      }

      router.replace({
        pathname: `/project/${projectId}/traces`,
        query: params.toString(),
      });
    },
    [projectId, router],
  );

  return {
    peekId: peek as string | undefined,
    timestamp: timestamp ? new Date(timestamp as string) : undefined,
    setPeekView,
  };
};

export const usePeekViewData = (
  projectId: string,
  peekId: string,
  timestamp?: Date,
) => {
  return api.traces.byIdWithObservationsAndScores.useQuery(
    {
      traceId: peekId,
      timestamp,
      projectId,
    },
    {
      enabled: !!peekId && !!timestamp,
      retry(failureCount, error) {
        if (
          error.data?.code === "UNAUTHORIZED" ||
          error.data?.code === "NOT_FOUND"
        )
          return false;
        return failureCount < 3;
      },
    },
  );
};
