import { Button } from "@/src/components/ui/button";
import { DialogTrigger } from "@/src/components/ui/dialog";
import { type CreateDatasetDialogProps } from "@/src/features/datasets/components/CreateDatasetDialogContent";
import { CreateDatasetDialogController } from "@/src/features/datasets/components/CreateDatasetDialogController";
import { LockIcon, PlusIcon } from "lucide-react";
import { forwardRef } from "react";

interface CreateDatasetButtonProps extends CreateDatasetDialogProps {
  size: "default" | "lg";
}

export const CreateDatasetButton = forwardRef<
  HTMLButtonElement,
  CreateDatasetButtonProps
>(({ projectId, target, size }, ref) => {
  return (
    <CreateDatasetDialogController projectId={projectId} target={target}>
      {({ disabled, openDialog }) => (
        <DialogTrigger asChild>
          <Button
            ref={ref}
            size={size}
            disabled={disabled !== undefined}
            onClick={openDialog}
            variant="default"
          >
            {disabled === undefined ? (
              <PlusIcon className="mr-1.5 -ml-0.5 h-4 w-4" aria-hidden="true" />
            ) : (
              <LockIcon className="mr-1.5 -ml-0.5 h-3 w-3" aria-hidden="true" />
            )}
            New dataset
          </Button>
        </DialogTrigger>
      )}
    </CreateDatasetDialogController>
  );
});

CreateDatasetButton.displayName = "CreateDatasetButton";
