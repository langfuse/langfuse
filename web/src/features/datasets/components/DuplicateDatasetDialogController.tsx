import { useRouter } from "next/router";
import { type ReactNode } from "react";

import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { DialogController } from "@/src/features/in-app-agent/components/dialog-controller";
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
  const duplicateDataset = api.datasets.duplicateDataset.useMutation({
    onSuccess: ({ id }) => {
      router.push(`/project/${projectId}/datasets/${id}/items`);
    },
  });

  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to duplicate this dataset." };

  return (
    <DialogController<true>
      dialog={(close, value) => (
        <ConfirmDialog
          open={hasAccess && value !== null}
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title="Duplicate dataset?"
          description="This creates a copy of the dataset and all of its items."
          confirmLabel="Duplicate dataset"
          loading={duplicateDataset.isPending}
          onConfirm={() => duplicateDataset.mutate({ projectId, datasetId })}
        />
      )}
    >
      {({ open }) =>
        children({
          disabled,
          openDialog: () => {
            if (hasAccess) open(true);
          },
        })
      }
    </DialogController>
  );
}
