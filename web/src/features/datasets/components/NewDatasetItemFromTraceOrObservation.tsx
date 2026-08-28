import { ChevronDown, LockIcon, PlusIcon } from "lucide-react";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import Link from "next/link";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { type Prisma } from "@langfuse/shared";
import { type MetadataDomainClient } from "@/src/utils/clientSideDomainTypes";
import { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets/components/NewDatasetItemFromExistingObjectDialogController";

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

  return (
    <NewDatasetItemFromExistingObjectDialogController {...props}>
      {({ Trigger }) => {
        if (existingDatasetItems && existingDatasetItems.length > 0) {
          return (
            <div>
              <DropdownMenu open={hasAccess ? undefined : false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={isMenu ? "ghost" : "secondary"}
                    size={buttonSize}
                    disabled={!hasAccess}
                    className={buttonClassName}
                  >
                    {isMenu ? (
                      <PlusIcon className="h-4 w-4" aria-hidden="true" />
                    ) : null}
                    <span className={isMenu ? "text-sm" : undefined}>
                      {`In ${existingDatasetItems.length} dataset(s)`}
                    </span>
                    <ChevronDown
                      className={isMenu ? "ml-auto h-3 w-3" : "ml-2 h-3 w-3"}
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {existingDatasetItems.map(
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
                  <Trigger asChild>
                    <DropdownMenuItem className="capitalize">
                      <PlusIcon size={16} className="mr-2" aria-hidden="true" />
                      Add to more datasets
                    </DropdownMenuItem>
                  </Trigger>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        }

        return (
          <Trigger asChild>
            <Button
              onClick={() => {
                capture("dataset_item:new_from_trace_form_open", {
                  object: props.observationId ? "observation" : "trace",
                });
              }}
              variant={buttonVariant}
              size={buttonSize}
              disabled={!hasAccess}
              className={buttonClassName}
            >
              {hasAccess ? (
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
                <span className="text-sm">Add to datasets</span>
              ) : (
                "Add to datasets"
              )}
              {!hasAccess ? (
                <LockIcon
                  className={isMenu ? "ml-auto h-3 w-3" : "ml-1.5 h-3 w-3"}
                  aria-hidden="true"
                />
              ) : null}
            </Button>
          </Trigger>
        );
      }}
    </NewDatasetItemFromExistingObjectDialogController>
  );
};
