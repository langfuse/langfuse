import { Button } from "@/src/components/ui/button";
import { LockIcon, PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useState } from "react";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { NewDatasetForm } from "@/src/features/datasets/components/NewDatasetForm";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";

export const NewDatasetButton = (props: {
  projectId: string;
  datasetId?: string;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
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
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="mb-5">Create new dataset</DialogTitle>
        </DialogHeader>
        <NewDatasetForm
          projectId={props.projectId}
          onFormSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
