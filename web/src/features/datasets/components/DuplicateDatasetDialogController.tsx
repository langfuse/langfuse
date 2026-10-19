import { useRouter } from "next/router";
import { type ReactNode } from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

export function DuplicateDatasetDialogController({
  children,
  datasetId,
  projectId,
}: {
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: () => void;
  }) => ReactNode;
  datasetId: string;
  projectId: string;
}) {
  const router = useRouter();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });
  const duplicateDataset = api.datasets.duplicateDataset.useMutation();

  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to duplicate this dataset." };

  return (
    <ConfirmationDialogController
      title="Duplicate dataset?"
      text="This creates a copy of the dataset and all of its items."
      confirmLabel="Duplicate dataset"
      variant="default"
      disabled={!hasAccess}
      loading={duplicateDataset.isPending}
      onConfirm={async () => {
        const { id } = await duplicateDataset.mutateAsync({
          projectId,
          datasetId,
        });
        router.push(`/project/${projectId}/datasets/${id}/items`);
      }}
    >
      {({ openDialog }) =>
        children({
          disabled,
          openDialog: () => {
            if (hasAccess) openDialog();
          },
        })
      }
    </ConfirmationDialogController>
  );
}
