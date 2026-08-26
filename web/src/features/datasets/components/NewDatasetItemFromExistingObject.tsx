import { api } from "@/src/utils/api";
import { type ButtonProps } from "@/src/components/ui/button";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { parseJsonPrioritised, type Prisma } from "@langfuse/shared";
import { type MetadataDomainClient } from "@/src/utils/clientSideDomainTypes";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { NewDatasetItemFromExistingObjectDialogController } from "./NewDatasetItemFromExistingObjectDialogController";
import { NewDatasetItemFromExistingObjectCopy } from "./NewDatasetItemFromExistingObjectCopy";
import { NewDatasetItemFromExistingObjectAdd } from "./NewDatasetItemFromExistingObjectAdd";
import { NewDatasetItemFromExistingObjectInDatasets } from "./NewDatasetItemFromExistingObjectInDatasets";

/**
 * Component for creating a new dataset item from an existing object.
 *
 * This component can be used in two different contexts:
 * 1. From a trace/observation: Creates a dataset item using data from a trace or observation
 *    (requires traceId and optionally observationId)
 * 2. From an existing dataset item: Creates a new dataset item based on an existing one
 *    (requires fromDatasetId) -> isCopyItem
 */
export const NewDatasetItemFromExistingObject = (props: {
  projectId: string;
  traceId?: string;
  observationId?: string;
  fromDatasetId?: string;
  input: Prisma.JsonValue | null;
  output: Prisma.JsonValue | null;
  metadata: MetadataDomainClient;
  isCopyItem?: boolean;
  buttonVariant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  /**
   * "toolbar" (default) is the inline button; "menu" renders the same trigger
   * as a full-width labeled row for the mobile header overflow popover.
   */
  layout?: "toolbar" | "menu";
}) => {
  const isMenu = props.layout === "menu";
  const normalizePrefillValue = (
    value: Prisma.JsonValue | null,
  ): Prisma.JsonValue | null => {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === "string") {
      const parsed = parseJsonPrioritised(value);
      return parsed !== undefined ? parsed : value;
    }

    return value;
  };

  const parsedInput = normalizePrefillValue(props.input);
  const parsedOutput = normalizePrefillValue(props.output);

  const isAuthenticatedAndProjectMember = useIsAuthenticatedAndProjectMember(
    props.projectId,
  );
  const observationInDatasets =
    api.datasets.datasetItemsBasedOnTraceOrObservation.useQuery(
      {
        projectId: props.projectId,
        traceId: props.traceId as string,
        observationId: props.observationId,
      },
      {
        enabled: isAuthenticatedAndProjectMember && !!props.traceId,
      },
    );
  const capture = usePostHogClientCapture();
  const buttonVariant = props.buttonVariant || "secondary";
  const buttonSize = props.size || "default";

  return (
    <NewDatasetItemFromExistingObjectDialogController
      projectId={props.projectId}
      traceId={props.traceId}
      observationId={props.observationId}
      fromDatasetId={props.fromDatasetId}
      input={parsedInput}
      output={parsedOutput}
      metadata={props.metadata}
      onOpen={
        props.isCopyItem
          ? undefined
          : () => {
              capture("dataset_item:new_from_trace_form_open", {
                object: props.observationId ? "observation" : "trace",
              });
            }
      }
    >
      {({ disabled, openDialog }) => {
        const hasAccess = disabled === undefined;

        return props.isCopyItem ? (
          <NewDatasetItemFromExistingObjectCopy
            hasAccess={hasAccess}
            size={buttonSize}
            onOpen={openDialog}
          />
        ) : observationInDatasets.data &&
          observationInDatasets.data.length > 0 ? (
          <NewDatasetItemFromExistingObjectInDatasets
            projectId={props.projectId}
            items={observationInDatasets.data}
            hasAccess={hasAccess}
            size={buttonSize}
            layout={isMenu ? "menu" : "toolbar"}
            onOpen={openDialog}
          />
        ) : (
          <NewDatasetItemFromExistingObjectAdd
            hasAccess={hasAccess}
            variant={buttonVariant}
            size={buttonSize}
            layout={isMenu ? "menu" : "toolbar"}
            onOpen={openDialog}
          />
        );
      }}
    </NewDatasetItemFromExistingObjectDialogController>
  );
};
