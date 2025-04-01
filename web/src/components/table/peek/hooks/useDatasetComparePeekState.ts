import { useRouter } from "next/router";
import { useCallback, useState } from "react";
import { api } from "@/src/utils/api";

export const useDatasetComparePeekState = (
  projectId: string,
  datasetId: string,
  pathname: string,
) => {
  const router = useRouter();
  const { peek: datasetItem } = router.query;

  const [selectedRunItemProps, setSelectedRunItemProps] = useState<{
    runId: string;
    traceId: string;
    observationId?: string;
  } | null>(null);

  const setPeekView = useCallback(
    (open: boolean, itemId?: string) => {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);

      if (!open || !itemId) {
        // close peek view
        params.delete("peek");
      } else if (open && itemId !== datasetItem) {
        // open peek view or update peek view
        params.set("peek", itemId);
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
    [projectId, datasetId, router, pathname, datasetItem],
  );

  return {
    datasetItemId: datasetItem as string | undefined,
    selectedRunItemProps,
    setSelectedRunItemProps,
    setPeekView,
  };
};

type UseDatasetComparePeekDataProps = {
  projectId: string;
  traceId?: string;
  timestamp?: Date;
  datasetItemId?: string;
  datasetId?: string;
};

export const useDatasetComparePeekData = ({
  projectId,
  traceId,
  timestamp,
  datasetItemId,
  // datasetId,
}: UseDatasetComparePeekDataProps) => {
  // const router = useRouter();
  // const runItemData = getRow();

  // const timestamp =
  //   router.query.timestamp && typeof router.query.timestamp === "string"
  //     ? new Date(decodeURIComponent(router.query.timestamp))
  //     : undefined;

  // Fetch all run data for this specific item
  // const runItems = api.datasets.runItemsByDatasetItemId.useQuery(
  //   {
  //     projectId,
  //     datasetId,
  //     datasetItemId: datasetItemId as string,
  //   },
  //   {
  //     enabled: !!datasetItemId,
  //     retry(failureCount, error) {
  //       if (error.data?.code === "UNAUTHORIZED") return false;
  //       return failureCount < 3;
  //     },
  //   },
  // );

  const trace = api.traces.byIdWithObservationsAndScores.useQuery(
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
    },
  );

  return { trace };
};
