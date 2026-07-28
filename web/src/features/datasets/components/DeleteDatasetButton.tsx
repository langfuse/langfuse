import { Button, type ButtonProps } from "@/src/components/ui/button";
import { type DeleteDatasetDialogDataProps } from "@/src/features/datasets/components/DeleteDatasetDialog";
import {
  DeleteDatasetDialogController,
  type DeleteDatasetDialogSource,
} from "@/src/features/datasets/components/DeleteDatasetDialogController";
import { LockIcon, Trash } from "lucide-react";
import { forwardRef } from "react";

interface DeleteDatasetButtonProps extends DeleteDatasetDialogDataProps {
  source: DeleteDatasetDialogSource;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

export const DeleteDatasetButton = forwardRef<
  HTMLButtonElement,
  DeleteDatasetButtonProps
>((props, ref) => {
  return (
    <DeleteDatasetDialogController
      projectId={props.projectId}
      datasetId={props.datasetId}
      datasetName={props.datasetName}
      source={props.source}
    >
      {({ disabled, openDialog }) => (
        <Button
          ref={ref}
          variant={props.variant || "ghost"}
          size={props.size}
          className={props.className}
          disabled={disabled !== undefined}
          onClick={(event) => {
            event.stopPropagation();
            openDialog();
          }}
        >
          {disabled === undefined ? (
            <Trash className="mr-2 h-4 w-4" />
          ) : (
            <LockIcon className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Delete
        </Button>
      )}
    </DeleteDatasetDialogController>
  );
});

DeleteDatasetButton.displayName = "DeleteDatasetButton";
