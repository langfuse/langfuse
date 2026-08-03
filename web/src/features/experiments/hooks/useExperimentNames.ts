import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";

type UseExperimentNamesResponse = {
  experimentNames: { experimentId: string; experimentName: string }[];
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
    { enabled: hasExperimentsReadAccess },
  );

  const sortedExperimentNames = data?.experimentNames.sort((a, b) =>
    a.experimentName.localeCompare(b.experimentName),
  );

  return { experimentNames: sortedExperimentNames ?? [], isLoading };
}
