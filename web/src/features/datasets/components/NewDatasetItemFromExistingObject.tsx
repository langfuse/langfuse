import { ChevronDown, CopyIcon, LockIcon, PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import Link from "next/link";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";
import { type Prisma } from "@langfuse/shared/src/db";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { parseJsonPrioritised } from "@langfuse/shared";
import { ActionButton } from "@/src/components/ActionButton";

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
  input: string | null;
  output: string | null;
  metadata: Prisma.JsonValue;
  isCopyItem?: boolean;
}) => {
  const parsedInput =
    props.input && typeof props.input === "string"
      ? (parseJsonPrioritised(props.input) ?? null)
      : null;

  const parsedOutput =
    props.output && typeof props.output === "string"
      ? (parseJsonPrioritised(props.output) ?? null)
      : null;

  const [isFormOpen, setIsFormOpen] = useState(false);
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
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });
  const capture = usePostHogClientCapture();

  return (
    <>
      {props.isCopyItem ? (
        <ActionButton
          variant="outline"
          size="icon"
          hasAccess={hasAccess}
          title="Copy item"
          aria-label="Copy item"
          onClick={() => {
            setIsFormOpen(true);
          }}
        >
          <CopyIcon className="size-3" />
        </ActionButton>
      ) : observationInDatasets.data &&
        observationInDatasets.data.length > 0 ? (
        <div>
          <DropdownMenu open={hasAccess ? undefined : false}>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" disabled={!hasAccess}>
                <span>{`In ${observationInDatasets.data.length} dataset(s)`}</span>
                <ChevronDown className="ml-2 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {observationInDatasets.data.map(
                ({ id: datasetItemId, dataset }) => (
                  <DropdownMenuItem
                    key={datasetItemId}
                    className="capitalize"
                    asChild
                  >
                    <Link
                      href={`/project/${props.projectId}/datasets/${dataset.id}/items/${datasetItemId}`}
                    >
                      {dataset.name}
                    </Link>
                  </DropdownMenuItem>
                ),
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="capitalize"
                onClick={() => {
                  setIsFormOpen(true);
                }}
              >
                <PlusIcon size={16} className={cn("mr-2")} aria-hidden="true" />
                Add to more datasets
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <Button
          onClick={() => {
            setIsFormOpen(true);
            capture("dataset_item:new_from_trace_form_open", {
              object: props.observationId ? "observation" : "trace",
            });
          }}
          variant="secondary"
          disabled={!hasAccess}
        >
          {hasAccess ? (
            <PlusIcon
              className={cn("-ml-0.5 mr-1.5 h-4 w-4")}
              aria-hidden="true"
            />
          ) : null}
          Add to datasets
          {!hasAccess ? (
            <LockIcon className={cn("ml-1.5 h-3 w-3")} aria-hidden="true" />
          ) : null}
        </Button>
      )}
      <Dialog open={hasAccess && isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="h-[calc(100vh-5rem)] max-h-none w-[calc(100vw-5rem)] max-w-none">
          <DialogHeader>
            <DialogTitle>Add to datasets</DialogTitle>
          </DialogHeader>
          {isFormOpen && (
            <NewDatasetItemForm
              traceId={props.traceId}
              observationId={props.observationId}
              projectId={props.projectId}
              input={parsedInput}
              output={parsedOutput}
              metadata={props.metadata}
              onFormSuccess={() => setIsFormOpen(false)}
              className="h-full overflow-y-auto"
              blockedDatasetIds={
                props.fromDatasetId ? [props.fromDatasetId] : undefined
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
