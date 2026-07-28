import { IconOnlyButton } from "@/src/components/IconOnlyButton";
import { type ButtonProps } from "@/src/components/ui/button";
import { type DeleteDatasetDialogDataProps } from "@/src/features/datasets/components/DeleteDatasetDialog";
import {
  DeleteDatasetDialogController,
  type DeleteDatasetDialogSource,
} from "@/src/features/datasets/components/DeleteDatasetDialogController";
import { Trash } from "lucide-react";
import { forwardRef } from "react";

interface DeleteDatasetIconButtonProps extends DeleteDatasetDialogDataProps {
  source: DeleteDatasetDialogSource;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

export const DeleteDatasetIconButton = forwardRef<
  HTMLButtonElement,
  DeleteDatasetIconButtonProps
>((props, ref) => {
  return (
    <DeleteDatasetDialogController
      projectId={props.projectId}
      datasetId={props.datasetId}
      datasetName={props.datasetName}
      source={props.source}
    >
      {({ disabled, openDialog }) => (
        <IconOnlyButton
          ref={ref}
          icon={<Trash className="h-4 w-4" />}
          label="Delete"
          aria-label="delete"
          disabledReason={disabled?.reason}
          variant={props.variant}
          size={props.size}
          className={props.className}
          onClick={(event) => {
            event.stopPropagation();
            openDialog();
          }}
        />
      )}
    </DeleteDatasetDialogController>
  );
});

DeleteDatasetIconButton.displayName = "DeleteDatasetIconButton";
