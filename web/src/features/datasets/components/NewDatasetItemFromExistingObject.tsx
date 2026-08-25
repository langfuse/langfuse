import { ChevronDown, PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { api } from "@/src/utils/api";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import Link from "next/link";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { parseJsonPrioritised, type Prisma } from "@langfuse/shared";
import { type MetadataDomainClient } from "@/src/utils/clientSideDomainTypes";
import { AddDatasetItemButton } from "./AddDatasetItemButton";
import { AddDatasetItemMenuItem } from "./AddDatasetItemMenuItem";
import { CopyDatasetItemButton } from "./CopyDatasetItemButton";

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
  const buttonVariant = props.buttonVariant || "secondary";
  const buttonSize = props.size || "default";

  return (
    <>
      {props.isCopyItem ? (
        <CopyDatasetItemButton
          hasAccess={hasAccess}
          size={buttonSize}
          onClick={() => setIsFormOpen(true)}
        />
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
              <DropdownMenuItem
                className="capitalize"
                onClick={() => setIsFormOpen(true)}
              >
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
              <DropdownMenuItem
                className="capitalize"
                onClick={() => setIsFormOpen(true)}
              >
                <PlusIcon size={16} className="mr-2" aria-hidden="true" />
                Add to more datasets
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      ) : isMenu ? (
        <AddDatasetItemMenuItem
          hasAccess={hasAccess}
          onClick={() => {
            setIsFormOpen(true);
            capture("dataset_item:new_from_trace_form_open", {
              object: props.observationId ? "observation" : "trace",
            });
          }}
        />
      ) : (
        <AddDatasetItemButton
          hasAccess={hasAccess}
          variant={buttonVariant}
          size={buttonSize}
          onClick={() => {
            setIsFormOpen(true);
            capture("dataset_item:new_from_trace_form_open", {
              object: props.observationId ? "observation" : "trace",
            });
          }}
        />
      )}
      <Dialog open={hasAccess && isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="h-[calc(100vh-5rem)] max-h-none w-[calc(100vw-5rem)] max-w-none">
          <DialogHeader>
            <DialogTitle>Add item to datasets</DialogTitle>
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
              currentDatasetId={props.fromDatasetId}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
