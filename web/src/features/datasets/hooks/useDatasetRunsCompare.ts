import { api } from "@/src/utils/api";
import { useMemo, useState } from "react";
import { useQueryParams, withDefault, ArrayParam } from "use-query-params";

export function useDatasetRunsCompare(projectId: string, datasetId: string) {
  const [runState, setRunState] = useQueryParams({
    runs: withDefault(ArrayParam, []),
  });

  const [localRuns, setLocalRuns] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const runIds = runState.runs as undefined | string[];

  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });

  const runsData = api.datasets.baseRunDataByDatasetId.useQuery(
    {
      projectId,
      datasetId,
    },
    {
      enabled: !!dataset.data,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  );

  const utils = api.useUtils();

  const handleExperimentSettled = async (data?: {
    success: boolean;
    datasetId: string;
    runId: string;
    runName: string;
  }) => {
    if (!data) return;
    void utils.datasets.baseRunDataByDatasetId.invalidate();
    setLocalRuns((prev) => [...prev, { key: data.runId, value: data.runName }]);
    setRunState({
      runs: [...(runIds ?? []), data.runId],
    });
  };

  const runs = useMemo(() => {
    const apiRuns =
      runsData.data?.map((run) => ({
        key: run.id,
        value: run.name,
      })) ?? [];

    return [...apiRuns, ...localRuns];
  }, [runsData.data, localRuns]);

  return {
    runIds,
    runs,
    dataset,
    runsData,
    handleExperimentSettled,
    setRunState,
    localRuns,
    setLocalRuns,
  };
}
