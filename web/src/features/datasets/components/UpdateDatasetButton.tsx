import { Button, type ButtonProps } from "@/src/components/ui/button";
import { DialogTrigger } from "@/src/components/ui/dialog";
import { type UpdateDatasetDialogProps } from "@/src/features/datasets/components/UpdateDatasetDialogContent";
import {
  UpdateDatasetDialogController,
  type UpdateDatasetDialogSource,
} from "@/src/features/datasets/components/UpdateDatasetDialogController";
import { Edit, LockIcon } from "lucide-react";
import { forwardRef } from "react";

interface UpdateDatasetButtonProps extends UpdateDatasetDialogProps {
  source: UpdateDatasetDialogSource;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

export const UpdateDatasetButton = forwardRef<
  HTMLButtonElement,
  UpdateDatasetButtonProps
>((props, ref) => {
  return (
    <UpdateDatasetDialogController
      projectId={props.projectId}
      datasetId={props.datasetId}
      datasetName={props.datasetName}
      datasetDescription={props.datasetDescription}
      datasetMetadata={props.datasetMetadata}
      datasetInputSchema={props.datasetInputSchema}
      datasetExpectedOutputSchema={props.datasetExpectedOutputSchema}
      source={props.source}
    >
      {({ disabled, openDialog }) => (
        <DialogTrigger asChild>
          <Button
            ref={ref}
            variant={props.variant || "ghost"}
            size={props.size || "icon"}
            className={props.className}
            disabled={disabled !== undefined}
            onClick={openDialog}
          >
            {disabled === undefined ? (
              <Edit className="mr-2 h-4 w-4" />
            ) : (
              <LockIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Edit
          </Button>
        </DialogTrigger>
      )}
    </UpdateDatasetDialogController>
  );
});

UpdateDatasetButton.displayName = "UpdateDatasetButton";
