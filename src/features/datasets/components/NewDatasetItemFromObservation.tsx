import { Button } from "@/src/components/ui/button";
import { ChevronDown, PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";
import { env } from "@/src/env.mjs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import Link from "next/link";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";

export const NewDatasetItemFromObservationButton = (props: {
  projectId: string;
  observationId: string;
  observationInput: string;
  observationOutput: string;
}) => {
  const [open, setOpen] = useState(false);
  const observationInDatasets = api.datasets.observationInDatasets.useQuery({
    projectId: props.projectId,
    observationId: props.observationId,
  });

  if (env.NEXT_PUBLIC_ENABLE_EXPERIMENTAL_FEATURES !== "true") return null;
  return (
    <>
      {observationInDatasets.data && observationInDatasets.data.length > 0 ? (
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
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
        <Button onClick={() => setOpen(true)}>
          <PlusIcon className={cn("-ml-0.5 mr-1.5")} aria-hidden="true" />
          Add to dataset
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
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
