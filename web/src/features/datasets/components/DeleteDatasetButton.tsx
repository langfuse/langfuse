import { IconOnlyButton } from "@/src/components/IconOnlyButton";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { DeleteDatasetDialog } from "@/src/features/datasets/components/DeleteDatasetDialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { LockIcon, Trash } from "lucide-react";
import { forwardRef, useState } from "react";

interface DeleteDatasetButtonProps {
  projectId: string;
  datasetId: string;
  datasetName: string;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

export const DeleteDatasetButton = forwardRef<
  HTMLButtonElement,
  DeleteDatasetButtonProps
>((props, ref) => {
  const capture = usePostHogClientCapture();
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  const actionButton = (
    <Button
      ref={ref}
      variant={props.variant || "ghost"}
      size={props.size}
      className={props.className}
      disabled={!hasAccess}
      onClick={(event) => {
        event.stopPropagation();
        setOpen(true);
        capture("datasets:delete_form_open", {
          source: "table-single-row",
        });
      }}
    >
      {hasAccess ? (
        <Trash className="mr-2 h-4 w-4" />
      ) : (
        <LockIcon className="mr-2 h-4 w-4" aria-hidden="true" />
      )}
      Delete
    </Button>
  );

  return (
    <DeleteDatasetDialog
      projectId={props.projectId}
      datasetId={props.datasetId}
      datasetName={props.datasetName}
      open={hasAccess && open}
      onOpenChange={setOpen}
      trigger={{ type: "dialog", element: actionButton }}
    />
  );
});

DeleteDatasetButton.displayName = "DeleteDatasetButton";

export const DeleteDatasetIconButton = forwardRef<
  HTMLButtonElement,
  DeleteDatasetButtonProps
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
