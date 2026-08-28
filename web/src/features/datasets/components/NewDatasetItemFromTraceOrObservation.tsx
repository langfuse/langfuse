import { ChevronDown, LockIcon, PlusIcon } from "lucide-react";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { type Prisma } from "@langfuse/shared";
import { type MetadataDomainClient } from "@/src/utils/clientSideDomainTypes";
import { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets/components/NewDatasetItemFromExistingObjectDialogController";
import { ExistingDatasetItemsDropdownMenuController } from "@/src/features/datasets/components/ExistingDatasetItemsDropdownMenuController";

/** Creates a dataset item using data from a trace or observation. */
export const NewDatasetItemFromTraceOrObservation = (props: {
  projectId: string;
  traceId: string;
  observationId?: string;
  input: Prisma.JsonValue | null;
  output: Prisma.JsonValue | null;
  metadata: MetadataDomainClient;
  buttonVariant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  /**
   * "toolbar" (default) is the inline button; "menu" renders the same trigger
   * as a full-width labeled row for the mobile header overflow popover.
   */
  layout?: "toolbar" | "menu";
}) => {
  const isMenu = props.layout === "menu";
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
        enabled: isAuthenticatedAndProjectMember,
      },
    ).data;
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });
  const capture = usePostHogClientCapture();
  const buttonVariant = isMenu ? "ghost" : (props.buttonVariant ?? "secondary");
  const buttonSize = isMenu ? "sm" : (props.size ?? "default");
  const buttonClassName = isMenu
    ? "w-full justify-start gap-2 font-normal"
    : undefined;
  const datasetCount = existingDatasetItems?.length ?? 0;
  const hasExistingDatasetItems = datasetCount > 0;

  return (
    <NewDatasetItemFromExistingObjectDialogController {...props}>
      {({ openDialog }) => (
        <ExistingDatasetItemsDropdownMenuController
          projectId={props.projectId}
          datasetItems={existingDatasetItems ?? []}
          disabled={!hasAccess}
          onOpenDialog={openDialog}
        >
          {({ Anchor, openDropdown }) => (
            <Anchor>
              <Button
                onClick={() => {
                  if (hasExistingDatasetItems) {
                    openDropdown();
                    return;
                  }

                  capture("dataset_item:new_from_trace_form_open", {
                    object: props.observationId ? "observation" : "trace",
                  });
                  openDialog();
                }}
                variant={
                  isMenu
                    ? "ghost"
                    : hasExistingDatasetItems
                      ? "secondary"
                      : buttonVariant
                }
                size={buttonSize}
                disabled={!hasAccess}
                className={buttonClassName}
              >
                {(hasExistingDatasetItems && isMenu) ||
                (!hasExistingDatasetItems && hasAccess) ? (
                  <PlusIcon
                    className={cn(
                      isMenu
                        ? "h-4 w-4"
                        : cn(
                            "mr-1.5 -ml-0.5",
                            buttonSize === "sm" ? "h-3.5 w-3.5" : "h-4 w-4",
                          ),
                    )}
                    aria-hidden="true"
                  />
                ) : null}
                {isMenu ? (
                  <span className="text-sm">
                    {hasExistingDatasetItems
                      ? `In ${datasetCount} dataset(s)`
                      : "Add to datasets"}
                  </span>
                ) : hasExistingDatasetItems ? (
                  `In ${datasetCount} dataset(s)`
                ) : (
                  "Add to datasets"
                )}
                {hasExistingDatasetItems ? (
                  <ChevronDown
                    className={isMenu ? "ml-auto h-3 w-3" : "ml-2 h-3 w-3"}
                  />
                ) : !hasAccess ? (
                  <LockIcon
                    className={isMenu ? "ml-auto h-3 w-3" : "ml-1.5 h-3 w-3"}
                    aria-hidden="true"
                  />
                ) : null}
              </Button>
            </Anchor>
          )}
        </ExistingDatasetItemsDropdownMenuController>
      )}
    </NewDatasetItemFromExistingObjectDialogController>
  );
};
