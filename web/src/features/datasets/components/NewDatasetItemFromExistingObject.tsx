import { ChevronDown, CopyIcon, LockIcon, PlusIcon } from "lucide-react";
import { api } from "@/src/utils/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import Link from "next/link";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { parseJsonPrioritised, type Prisma } from "@langfuse/shared";
import { type MetadataDomainClient } from "@/src/utils/clientSideDomainTypes";
import { ActionButton } from "@/src/components/ActionButton";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { NewDatasetItemFromExistingObjectDialogController } from "./NewDatasetItemFromExistingObjectDialogController";

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
          <ActionButton
            variant="outline"
            size={buttonSize === "sm" ? "icon-xs" : "icon"}
            hasAccess={hasAccess}
            title="Copy item"
            aria-label="Copy item"
            onClick={openDialog}
          >
            <CopyIcon className="size-3" />
          </ActionButton>
        ) : observationInDatasets.data &&
          observationInDatasets.data.length > 0 ? (
          isMenu ? (
            <DropdownMenu open={hasAccess ? undefined : false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!hasAccess}
                  className="w-full justify-start gap-2 font-normal"
                >
                  <PlusIcon className="h-4 w-4" aria-hidden="true" />
                  <span className="text-sm">
                    In {observationInDatasets.data.length} dataset(s)
                  </span>
                  <ChevronDown className="ml-auto h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {observationInDatasets.data.map(
                  ({ id: datasetItemId, datasetName, datasetId }) => (
                    <DropdownMenuItem
                      key={datasetItemId}
                      className="capitalize"
                      asChild
                    >
                      <Link
                        href={`/project/${props.projectId}/datasets/${datasetId}/items/${datasetItemId}`}
                      >
                        {datasetName}
                      </Link>
                    </DropdownMenuItem>
                  ),
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="capitalize" onClick={openDialog}>
                  <PlusIcon size={16} className="mr-2" aria-hidden="true" />
                  Add to more datasets
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <DropdownMenu open={hasAccess ? undefined : false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size={buttonSize}
                  disabled={!hasAccess}
                >
                  <span>In {observationInDatasets.data.length} dataset(s)</span>
                  <ChevronDown className="ml-2 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {observationInDatasets.data.map(
                  ({ id: datasetItemId, datasetName, datasetId }) => (
                    <DropdownMenuItem
                      key={datasetItemId}
                      className="capitalize"
                      asChild
                    >
                      <Link
                        href={`/project/${props.projectId}/datasets/${datasetId}/items/${datasetItemId}`}
                      >
                        {datasetName}
                      </Link>
                    </DropdownMenuItem>
                  ),
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="capitalize" onClick={openDialog}>
                  <PlusIcon size={16} className="mr-2" aria-hidden="true" />
                  Add to more datasets
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        ) : isMenu ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasAccess}
            className="w-full justify-start gap-2 font-normal"
            onClick={openDialog}
          >
            {hasAccess ? (
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <LockIcon className="h-3 w-3" aria-hidden="true" />
            )}
            <span className="text-sm">Add to datasets</span>
          </Button>
        ) : (
          <Button
            onClick={openDialog}
            variant={buttonVariant}
            size={buttonSize}
            disabled={!hasAccess}
          >
            {hasAccess ? (
              <PlusIcon
                className={`mr-1.5 -ml-0.5 ${
                  buttonSize === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"
                }`}
                aria-hidden="true"
              />
            ) : null}
            Add to datasets
            {!hasAccess ? (
              <LockIcon className="ml-1.5 h-3 w-3" aria-hidden="true" />
            ) : null}
          </Button>
        );
      }}
    </NewDatasetItemFromExistingObjectDialogController>
  );
};
