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
import { type Prisma } from "@langfuse/shared/src/db";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { useSession } from "next-auth/react";

export const NewDatasetItemFromObservationButton = (props: {
  projectId: string;
  observationId: string;
  observationInput: Prisma.JsonValue;
  observationOutput: Prisma.JsonValue;
}) => {
  const [open, setOpen] = useState(false);
  const session = useSession();
  const observationInDatasets = api.datasets.observationInDatasets.useQuery(
    {
      projectId: props.projectId,
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
          onClick={() => setOpen(true)}
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
        <DialogContent className="sm:w-3xl lg:max-w-none">
          <DialogHeader>
            <DialogTitle className="mb-5">Add to dataset</DialogTitle>
          </DialogHeader>
          <NewDatasetItemForm
            observationId={props.observationId}
            projectId={props.projectId}
            observationInput={props.observationInput}
            observationOutput={props.observationOutput}
            onFormSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
