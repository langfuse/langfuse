import { type ButtonProps } from "@/src/components/ui/button";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { NewDatasetItemFromExistingObjectAdd } from "@/src/features/datasets/components/NewDatasetItemFromExistingObjectAdd";
import { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets/components/NewDatasetItemFromExistingObjectDialogController";
import { NewDatasetItemFromExistingObjectInDatasets } from "@/src/features/datasets/components/NewDatasetItemFromExistingObjectInDatasets";
import { api } from "@/src/utils/api";

export const NewDatasetItemFromTraceId = (props: {
  projectId: string;
  traceId: string;
  timestamp: Date;
  buttonVariant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) => {
  // SessionIO already fetches the trace, so this doesn't add an extra request
  const trace = api.traces.byId.useQuery(
    {
      traceId: props.traceId,
      projectId: props.projectId,
      timestamp: props.timestamp,
    },
    {
      enabled: typeof props.traceId === "string",
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
    },
  );
  const isAuthenticatedAndProjectMember = useIsAuthenticatedAndProjectMember(
    props.projectId,
  );
  const datasetItems =
    api.datasets.datasetItemsBasedOnTraceOrObservation.useQuery(
      {
        projectId: props.projectId,
        traceId: props.traceId,
      },
      { enabled: isAuthenticatedAndProjectMember },
    );
  const capture = usePostHogClientCapture();

  if (!trace.data) return null;

  return (
    <NewDatasetItemFromExistingObjectDialogController
      projectId={props.projectId}
      traceId={props.traceId}
      input={trace.data.input ?? null}
      output={trace.data.output ?? null}
      metadata={trace.data.metadata ?? null}
      onOpen={() =>
        capture("dataset_item:new_from_trace_form_open", { object: "trace" })
      }
    >
      {({ disabled, openDialog }) => {
        const hasAccess = disabled === undefined;
        const size = props.size ?? "default";

        return datasetItems.data && datasetItems.data.length > 0 ? (
          <NewDatasetItemFromExistingObjectInDatasets
            projectId={props.projectId}
            items={datasetItems.data}
            hasAccess={hasAccess}
            size={size}
            layout="toolbar"
            onOpen={openDialog}
          />
        ) : (
          <NewDatasetItemFromExistingObjectAdd
            hasAccess={hasAccess}
            variant={props.buttonVariant ?? "secondary"}
            size={size}
            layout="toolbar"
            onOpen={openDialog}
          />
        );
      }}
    </NewDatasetItemFromExistingObjectDialogController>
  );
};
