import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

type UseExperimentNamesResponse = {
  experimentNames: {
    experimentId: string;
    experimentName: string;
    datasetId: string | null;
  }[];
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

  const sortedExperimentNames = data?.experimentNames.sort((a, b) =>
    a.experimentName.localeCompare(b.experimentName),
  );

  return { experimentNames: sortedExperimentNames ?? [], isLoading };
}
