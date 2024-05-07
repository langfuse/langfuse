import { Button } from "@/src/components/ui/button";
import { ChevronDown, LockIcon, PlusIcon } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import Link from "next/link";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";
import { type Prisma } from "@langfuse/shared";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { useSession } from "next-auth/react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export const NewDatasetItemFromTrace = (props: {
  projectId: string;
  traceId: string;
  observationId?: string;
  input: Prisma.JsonValue;
  output: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
}) => {
  const [open, setOpen] = useState(false);
  const session = useSession();
  const observationInDatasets =
    api.datasets.datasetItemsBasedOnTraceOrObservation.useQuery(
      {
        projectId: props.projectId,
        traceId: props.traceId,
        observationId: props.observationId,
      },
      {
        enabled: session.status === "authenticated",
      },
    );
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });
  const capture = usePostHogClientCapture();

  return (
    <>
      {observationInDatasets.data && observationInDatasets.data.length > 0 ? (
        <div>
          <DropdownMenu open={hasAccess ? undefined : false}>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" disabled={!hasAccess}>
                <span>{`In ${observationInDatasets.data.length} dataset(s)`}</span>
                <ChevronDown className="ml-2" />
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
                onClick={() => setOpen(true)}
              >
                <PlusIcon size={16} className={cn("mr-2")} aria-hidden="true" />
                Add new
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <Button
          onClick={() => {
            setOpen(true);
            capture("dataset_item:new_from_trace_form_open", {
              object: props.observationId ? "observation" : "trace",
            });
          }}
          variant="secondary"
          disabled={!hasAccess}
        >
          {hasAccess ? (
            <PlusIcon className={cn("-ml-0.5 mr-1.5")} aria-hidden="true" />
          ) : null}
          Add to dataset
          {!hasAccess ? (
            <LockIcon className={cn("ml-1.5 h-3 w-3")} aria-hidden="true" />
          ) : null}
        </Button>
      )}
      <Dialog open={hasAccess && open} onOpenChange={setOpen}>
        <DialogContent className="h-[calc(100vh-5rem)] max-h-none w-[calc(100vw-5rem)] max-w-none">
          <DialogHeader>
            <DialogTitle>Add to dataset</DialogTitle>
          </DialogHeader>
          <NewDatasetItemForm
            traceId={props.traceId}
            observationId={props.observationId}
            projectId={props.projectId}
            input={props.input}
            output={props.output}
            metadata={props.metadata}
            onFormSuccess={() => setOpen(false)}
            className="h-full overflow-y-auto"
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
