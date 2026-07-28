import { IconOnlyButton } from "@/src/components/IconOnlyButton";
import { type ButtonProps } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/ui/dialog";
import {
  UpdateDatasetDialogContent,
  type UpdateDatasetDialogContentProps,
} from "@/src/features/datasets/components/UpdateDatasetDialogContent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Pen } from "lucide-react";
import { forwardRef, useState } from "react";

interface UpdateDatasetIconButtonProps extends Pick<
  UpdateDatasetDialogContentProps,
  | "projectId"
  | "datasetId"
  | "datasetName"
  | "datasetDescription"
  | "datasetMetadata"
  | "datasetInputSchema"
  | "datasetExpectedOutputSchema"
> {
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

export const UpdateDatasetIconButton = forwardRef<
  HTMLButtonElement,
  UpdateDatasetIconButtonProps
>((props, ref) => {
  const capture = usePostHogClientCapture();
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      <IconOnlyButton
        ref={ref}
        icon={<Pen className="h-4 w-4" />}
        label="Edit"
        aria-label="edit"
        disabledReason={
          hasAccess
            ? undefined
            : "You don't have permission to edit this dataset."
        }
        variant={props.variant}
        size={props.size}
        className={props.className}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
          capture("datasets:update_form_open", {
            source: "table-single-row",
          });
        }}
      />
      <UpdateDatasetDialogContent
        {...props}
        onFormSuccess={() => setOpen(false)}
      />
    </Dialog>
  );
});

UpdateDatasetIconButton.displayName = "UpdateDatasetIconButton";
