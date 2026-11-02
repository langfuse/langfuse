import { useHasProjectAccess } from "@/src/features/rbac";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import type * as React from "react";

export const DeleteDatasetRunDialogController = ({
  projectId,
  datasetRunId,
  redirectUrl,
  datasetId,
  children,
}: {
  projectId: string;
  datasetRunId: string;
  redirectUrl?: string;
  datasetId: string;
  children: (control: {
    disabled: boolean;
    openDialog: () => void;
  }) => React.ReactNode;
}) => {
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "datasets:CUD",
  });
  const utils = api.useUtils();
  const router = useRouter();
  const mutDelete = api.datasets.deleteDatasetRuns.useMutation({
    onSuccess: () => {
      redirectUrl ? router.push(redirectUrl) : utils.datasets.invalidate();
    },
  });

  return (
    <ConfirmationDialogController
      title="Please confirm"
      text="This action cannot be undone. Traces linked to this run must be deleted manually."
      confirmLabel="Delete Dataset Run"
      variant="destructive"
      disabled={!hasAccess}
      loading={mutDelete.isPending}
      onConfirm={async () => {
        capture("dataset_run:delete_form_submit");
        await mutDelete.mutateAsync({
          projectId,
          datasetId: datasetId,
          datasetRunIds: [datasetRunId],
        });
      }}
    >
      {({ openDialog }) =>
        children({
          disabled: !hasAccess,
          openDialog: () => {
            if (!hasAccess) return;
            capture("dataset_run:delete_form_open");
            openDialog();
          },
        })
      }
    </ConfirmationDialogController>
  );
};
