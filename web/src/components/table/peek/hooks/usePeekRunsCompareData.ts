import { api } from "@/src/utils/api";

type UsePeekRunsCompareDataProps = {
  projectId: string;
  datasetId?: string;
  datasetItemId?: string;
  traceId?: string;
  timestamp?: Date;
};

export const usePeekRunsCompareData = ({
  projectId,
  traceId,
  timestamp,
  datasetId,
  datasetItemId,
}: UsePeekRunsCompareDataProps) => {
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
      staleTime: 60 * 1000, // 1 minute
    },
  );

  const datasetItem = api.datasets.itemById.useQuery(
    {
      projectId,
      datasetId: datasetId as string,
      datasetItemId: datasetItemId as string,
    },
    {
      enabled: !!datasetId && !!datasetItemId,
    },
  );

  // TODO: filter down to only relevant runs.
  const runItems = api.datasets.runitemsByRunIdOrItemId.useQuery(
    {
      projectId,
      datasetId: datasetId as string,
      datasetItemId: datasetItemId as string,
    },
    {
      enabled: !!datasetId && !!datasetItemId,
    },
  );

  return {
    trace,
    datasetItem,
    runItems,
  };
};
