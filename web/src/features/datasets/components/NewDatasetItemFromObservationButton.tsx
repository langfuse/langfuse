import { LockIcon, PlusIcon } from "lucide-react";
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
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/src/components/ui/dropdown-menu";
import Link from "next/link";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";
import { type Prisma } from "@langfuse/shared/src/db";
import { useSession } from "next-auth/react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

const AddToDatasetMenuItem = ({
  hasAccess,
  handleOnSelect,
}: {
  hasAccess: boolean;
  handleOnSelect: (event: Event) => void;
}) => {
  return (
    <DropdownMenuItem
      disabled={!hasAccess}
      onSelect={handleOnSelect}
      className="hover:bg-accent"
    >
      {hasAccess ? (
        <PlusIcon className={cn("-ml-0.5 mr-1.5 h-4 w-4")} aria-hidden="true" />
      ) : null}
      Add to dataset
      {!hasAccess ? (
        <LockIcon className={cn("ml-1.5 h-3 w-3")} aria-hidden="true" />
      ) : null}
    </DropdownMenuItem>
  );
};

export const NewDatasetItemFromTrace = (props: {
  projectId: string;
  traceId: string;
  observationId?: string;
  input: Prisma.JsonValue;
  output: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
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
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  const handleOnAddToDatasetSelect = (event: Event) => {
    event.preventDefault();
    setIsFormOpen(true);
  };

  return observationInDatasets.data && observationInDatasets.data.length > 0 ? (
    <DropdownMenuSub key="dataset" open={hasAccess ? undefined : false}>
      <DropdownMenuSubTrigger>
        <span>{`In ${observationInDatasets.data.length} dataset(s)`}</span>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            {observationInDatasets.data.map(
              ({ id: datasetItemId, dataset }) => (
                <DropdownMenuItem
                  key={datasetItemId}
                  className="capitalize hover:bg-accent hover:underline"
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
            <>
              <AddToDatasetMenuItem
                hasAccess={hasAccess}
                handleOnSelect={handleOnAddToDatasetSelect}
              />
              {isFormOpen && (
                <Dialog
                  open={hasAccess && isFormOpen}
                  onOpenChange={setIsFormOpen}
                >
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
                      onFormSuccess={() => setIsFormOpen(false)}
                      className="h-full overflow-y-auto"
                    />
                  </DialogContent>
                </Dialog>
              )}
            </>
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSubTrigger>
    </DropdownMenuSub>
  ) : (
    <>
      <AddToDatasetMenuItem
        hasAccess={hasAccess}
        handleOnSelect={handleOnAddToDatasetSelect}
      />
      {isFormOpen && (
        <Dialog open={hasAccess && isFormOpen} onOpenChange={setIsFormOpen}>
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
              onFormSuccess={() => setIsFormOpen(false)}
              className="h-full overflow-y-auto"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
