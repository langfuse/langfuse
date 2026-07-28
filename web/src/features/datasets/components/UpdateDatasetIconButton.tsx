import { IconOnlyButton } from "@/src/components/IconOnlyButton";
import { type ButtonProps } from "@/src/components/ui/button";
import { type UpdateDatasetDialogProps } from "@/src/features/datasets/components/UpdateDatasetDialogContent";
import {
  UpdateDatasetDialogController,
  type UpdateDatasetDialogSource,
} from "@/src/features/datasets/components/UpdateDatasetDialogController";
import { Pen } from "lucide-react";
import { forwardRef } from "react";

interface UpdateDatasetIconButtonProps extends UpdateDatasetDialogProps {
  source: UpdateDatasetDialogSource;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

export const UpdateDatasetIconButton = forwardRef<
  HTMLButtonElement,
  UpdateDatasetIconButtonProps
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
        <IconOnlyButton
          ref={ref}
          icon={<Pen className="h-4 w-4" />}
          label="Edit"
          aria-label="edit"
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
    </UpdateDatasetDialogController>
  );
});

UpdateDatasetIconButton.displayName = "UpdateDatasetIconButton";
