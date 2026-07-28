import { IconOnlyButton } from "@/src/components/IconOnlyButton";
import { type ButtonProps } from "@/src/components/ui/button";
import { DeleteDatasetDialog } from "@/src/features/datasets/components/DeleteDatasetDialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Trash } from "lucide-react";
import { forwardRef, useState } from "react";

interface DeleteDatasetIconButtonProps {
  projectId: string;
  datasetId: string;
  datasetName: string;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

export const DeleteDatasetIconButton = forwardRef<
  HTMLButtonElement,
  DeleteDatasetIconButtonProps
>((props, ref) => {
  const capture = usePostHogClientCapture();
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  return (
    <>
      <IconOnlyButton
        ref={ref}
        icon={<Trash className="h-4 w-4" />}
        label="Delete"
        aria-label="delete"
        disabledReason={
          hasAccess
            ? undefined
            : "You don't have permission to delete this dataset."
        }
        variant={props.variant}
        size={props.size}
        className={props.className}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
          capture("datasets:delete_form_open", {
            source: "table-single-row",
          });
        }}
      />
      <DeleteDatasetDialog
        projectId={props.projectId}
        datasetId={props.datasetId}
        datasetName={props.datasetName}
        open={hasAccess && open}
        onOpenChange={setOpen}
        trigger={{ type: "external" }}
      />
    </>
  );
});

DeleteDatasetIconButton.displayName = "DeleteDatasetIconButton";
