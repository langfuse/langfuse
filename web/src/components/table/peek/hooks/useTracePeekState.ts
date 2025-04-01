import { useRouter } from "next/router";
import { useCallback } from "react";
import { api } from "@/src/utils/api";
import { usePeekStorage } from "@/src/components/table/peek/hooks/usePeekStorage";
import { TracesTableRow } from "@/src/components/table/use-cases/traces";
import { usePeekStore } from "@/src/components/table/peek/store/usePeekStore";

export const useTracePeekState = (projectId: string, pathname: string) => {
  const router = useRouter();
  const row = usePeekStore((state) => state.getRow("traces")) as TracesTableRow;
  const { peek, timestamp } = router.query;

  const setPeekView = useCallback(
    (open: boolean, id?: string) => {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);

      if (!open || !id) {
        // close peek view
        params.delete("peek");
        params.delete("timestamp");
        params.delete("observation");
        params.delete("display");
      } else if (open && id !== peek) {
        // open peek view or update peek view
        params.set("peek", id);
        const timestamp = row?.timestamp;
        if (timestamp) params.set("timestamp", timestamp.toISOString());
        params.delete("observation");
      } else {
        return;
      }

      router.replace(
        {
          pathname,
          query: params.toString(),
        },
        undefined,
        { shallow: true },
      );
    },
    [projectId, router],
  );

  return {
    peekId: peek as string | undefined,
    timestamp: timestamp ? new Date(timestamp as string) : undefined,
    setPeekView,
  };
};

export const usePeekData = (
  projectId: string,
  peekId?: string,
  timestamp?: Date,
) => {
  return api.traces.byIdWithObservationsAndScores.useQuery(
    {
      traceId: peekId as string,
      timestamp,
      projectId,
    },
    {
      enabled: !!peekId,
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
