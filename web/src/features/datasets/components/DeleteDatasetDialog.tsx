import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";
import { type ReactNode } from "react";
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
  const utils = api.useUtils();
  const deleteMutation = api.datasets.deleteDataset.useMutation();

  const handleDelete = async () => {
    capture("datasets:delete_form_submit");

    await deleteMutation.mutateAsync({ projectId, datasetId });

    capture("datasets:delete_dataset_button_click");

    if (redirectUrl) {
      await router.push(redirectUrl);
    } else {
      await utils.datasets.invalidate();
    }
  };

  return (
    <ConfirmationDialogController
      title="Please confirm"
      text="This action cannot be undone and removes all the data associated with this dataset."
      confirmationText={datasetName}
      confirmLabel="Delete dataset"
      variant="destructive"
      loading={deleteMutation.isPending}
      onConfirm={handleDelete}
    >
      {children}
    </ConfirmationDialogController>
  );
}
