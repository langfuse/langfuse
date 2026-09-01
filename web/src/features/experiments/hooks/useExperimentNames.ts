import { useMemo } from "react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";

export type ExperimentNameOption = {
  experimentId: string;
  experimentName: string;
  datasetId: string | null;
  datasetName: string | null;
  startTime: Date;
};

type UseExperimentNamesResponse = {
  experimentNames: ExperimentNameOption[];
  isLoading: boolean;
};

export function useExperimentNames({
  projectId,
}: {
  projectId: string;
}): UseExperimentNamesResponse {
  const hasExperimentsReadAccess = useHasProjectAccess({
    projectId,
    scope: "promptExperiments:read",
  });

  const { data, isLoading } = api.experiments.byProjectId.useQuery(
    {
      projectId,
    },
    // `projectId` arrives with `router.query` after hydration; without it in
    // the guard the query can fire with `undefined` and zod rejects it.
    { enabled: Boolean(projectId) && hasExperimentsReadAccess },
  );

  // Newest first: the run worth comparing against is a recent one, not the one
  // the alphabet happens to put on top. Copied before sorting so the query
  // cache is not mutated in place.
  const experimentNames = useMemo(
    () =>
      [...(data?.experimentNames ?? [])].sort(
        (a, b) => b.startTime.getTime() - a.startTime.getTime(),
      ),
    [data?.experimentNames],
  );

  return { experimentNames, isLoading };
}
