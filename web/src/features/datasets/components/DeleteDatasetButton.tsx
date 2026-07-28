import { IconOnlyButton } from "@/src/components/IconOnlyButton";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { LockIcon, Trash } from "lucide-react";
import { forwardRef, useState } from "react";

interface DeleteDatasetButtonProps {
  projectId: string;
  datasetId: string;
  datasetName: string;
  icon?: boolean;
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
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });
  const utils = api.useUtils();
  const deleteMutation = api.datasets.deleteDataset.useMutation();

  const actionButton = props.icon ? (
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
  ) : (
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

  const handleDelete = async () => {
    capture("datasets:delete_form_submit");
    try {
      await deleteMutation.mutateAsync({
        projectId: props.projectId,
        datasetId: props.datasetId,
      });
      utils.datasets.invalidate();
      setDeleteConfirmationInput("");
      setOpen(false);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <>
      {props.icon ? actionButton : null}
      <ConfirmDialog
        open={hasAccess && open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) setDeleteConfirmationInput("");
        }}
        trigger={props.icon ? undefined : actionButton}
        size="lg"
        title="Please confirm"
        description="This action cannot be undone and removes all the data associated with this dataset."
        confirmLabel="Delete dataset"
        confirmDisabled={deleteConfirmationInput !== props.datasetName}
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      >
        <div className="grid w-full gap-1.5">
          <Label htmlFor="delete-confirmation">
            Type &quot;{props.datasetName}&quot; to confirm deletion
          </Label>
          <Input
            id="delete-confirmation"
            value={deleteConfirmationInput}
            onChange={(event) => setDeleteConfirmationInput(event.target.value)}
          />
        </div>
      </ConfirmDialog>
    </>
  );
});

DeleteDatasetButton.displayName = "DeleteDatasetButton";
