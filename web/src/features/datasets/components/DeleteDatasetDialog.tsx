import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { DialogController } from "@/src/features/in-app-agent/components/dialog-controller";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";
import { type ReactNode, useState } from "react";
import { useRouter } from "next/router";

export interface DeleteDatasetDialogDataProps {
  projectId: string;
  datasetId: string;
  datasetName: string;
  redirectUrl?: string;
}

export function DeleteDatasetDialog({
  children,
  projectId,
  datasetId,
  datasetName,
  redirectUrl,
}: DeleteDatasetDialogDataProps & {
  children: (control: { openDialog: () => void }) => ReactNode;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");
  const utils = api.useUtils();
  const deleteMutation = api.datasets.deleteDataset.useMutation();

  const handleDelete = async (close: () => void) => {
    capture("datasets:delete_form_submit");

    try {
      await deleteMutation.mutateAsync({ projectId, datasetId });
    } catch {
      // The tRPC error handler owns mutation failures; keep the dialog open.
      return;
    }

    capture("datasets:delete_dataset_button_click");
    setDeleteConfirmationInput("");
    close();

    if (redirectUrl) {
      await router.push(redirectUrl);
    } else {
      await utils.datasets.invalidate();
    }
  };

  return (
    <DialogController<true>
      dialog={(close, value) => (
        <ConfirmDialog
          open={value !== null}
          onOpenChange={(open) => {
            if (open) return;
            setDeleteConfirmationInput("");
            close();
          }}
          size="lg"
          title="Please confirm"
          description="This action cannot be undone and removes all the data associated with this dataset."
          confirmLabel="Delete dataset"
          confirmDisabled={deleteConfirmationInput !== datasetName}
          loading={deleteMutation.isPending}
          onConfirm={() => handleDelete(close)}
        >
          <div className="grid w-full gap-1.5">
            <Label htmlFor="delete-confirmation">
              Type &quot;{datasetName}&quot; to confirm deletion
            </Label>
            <Input
              id="delete-confirmation"
              value={deleteConfirmationInput}
              onChange={(event) =>
                setDeleteConfirmationInput(event.target.value)
              }
            />
          </div>
        </ConfirmDialog>
      )}
    >
      {({ open }) => children({ openDialog: () => open(true) })}
    </DialogController>
  );
}
