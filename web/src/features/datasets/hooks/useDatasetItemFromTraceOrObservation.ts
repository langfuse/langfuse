import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

export const useDatasetItemFromTraceOrObservation = (props: {
  projectId: string;
  traceId: string;
  observationId?: string;
  enabled?: boolean;
}) => {
  const isAuthenticatedAndProjectMember = useIsAuthenticatedAndProjectMember(
    props.projectId,
  );
  const existingDatasetItems =
    api.datasets.datasetItemsBasedOnTraceOrObservation.useQuery(
      {
        projectId: props.projectId,
        traceId: props.traceId,
        observationId: props.observationId,
      },
      {
        enabled: (props.enabled ?? true) && isAuthenticatedAndProjectMember,
      },
    ).data ?? [];
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });
  const capture = usePostHogClientCapture();

  return {
    existingDatasetItems,
    hasAccess,
    captureNewDatasetItemFormOpen: () =>
      capture("dataset_item:new_from_trace_form_open", {
        object: props.observationId ? "observation" : "trace",
      }),
  };
};
