import { Button } from "@/src/components/ui/button";
import { Edit, LockIcon, PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useState } from "react";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { DatasetForm } from "@/src/features/datasets/components/DatasetForm";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";

interface BaseDatasetButtonProps {
  mode: "create" | "rename";
  projectId: string;
  className?: string;
  onFormSuccess?: () => void;
}

interface CreateDatasetButtonProps extends BaseDatasetButtonProps {
  mode: "create";
}

interface RenameDatasetButtonProps extends BaseDatasetButtonProps {
  mode: "rename";
  datasetId: string;
  datasetName: string;
}

type DatasetActionButtonProps =
  | CreateDatasetButtonProps
  | RenameDatasetButtonProps;

export const DatasetActionButton = (props: DatasetActionButtonProps) => {
  const [open, setOpen] = useState(false);
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {props.mode === "rename" ? (
          <div
            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            onClick={() => setOpen(true)}
          >
            {hasAccess ? (
              <Edit className="mr-2 h-4 w-4" />
            ) : (
              <LockIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Rename
          </div>
        ) : (
          <Button
            variant="secondary"
            className={props.className}
            disabled={!hasAccess}
          >
            {hasAccess ? (
              <PlusIcon className="-ml-0.5 mr-1.5" aria-hidden="true" />
            ) : (
              <LockIcon className="-ml-0.5 mr-1.5 h-3 w-3" aria-hidden="true" />
            )}
            New dataset
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="mb-5">
            {props.mode === "create" ? "Create new dataset" : "Rename dataset"}
          </DialogTitle>
        </DialogHeader>
        {props.mode === "create" ? (
          <DatasetForm
            mode="create"
            projectId={props.projectId}
            onFormSuccess={() => setOpen(false)}
          />
        ) : (
          <DatasetForm
            mode="rename"
            projectId={props.projectId}
            onFormSuccess={() => setOpen(false)}
            datasetId={props.datasetId}
            datasetName={props.datasetName}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
