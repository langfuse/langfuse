import type * as React from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { useHasProjectAccess } from "@/src/features/rbac";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useEmptyScoreConfigs } from "@/src/features/scores";
import { api } from "@/src/utils/api";

type ArchiveScoreConfigDialogControllerProps = {
  children: (control: {
    disabled: { reason: string } | undefined;
    isOpen: boolean;
    openDialog: () => void;
  }) => React.ReactNode;
  configId: string;
  projectId: string;
  isArchived: boolean;
  name: string;
};

export const ArchiveScoreConfigDialogController = ({
  children,
  configId,
  projectId,
  isArchived,
  name,
}: ArchiveScoreConfigDialogControllerProps) => {
  const capture = usePostHogClientCapture();
  const { emptySelectedConfigIds, setEmptySelectedConfigIds } =
    useEmptyScoreConfigs();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scoreConfigs:CUD",
  });
  const utils = api.useUtils();
  const configMutation = api.scoreConfigs.update.useMutation({
    onSuccess: () => utils.scoreConfigs.invalidate(),
  });
  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to archive this score config." };

  return (
    <ConfirmationDialogController
      title={isArchived ? "Restore config" : "Archive config"}
      text={
        isArchived
          ? `Your config is currently archived. Restore if you want to use "${name}" in annotation again.`
          : `Your config is currently active. Archive if you no longer want to use "${name}" in annotation. Historic "${name}" scores will still be shown and can be deleted. You can restore your config at any point.`
      }
      confirmLabel="Confirm"
      variant={isArchived ? "default" : "destructive"}
      loading={configMutation.isPending}
      onConfirm={async () => {
        await configMutation.mutateAsync({
          projectId,
          id: configId,
          isArchived: !isArchived,
        });
        setEmptySelectedConfigIds(
          emptySelectedConfigIds.filter((id) => id !== configId),
        );
        capture("score_configs:archive_form_submit");
      }}
    >
      {({ isOpen, openDialog }) =>
        children({
          disabled,
          isOpen,
          openDialog: () => {
            capture("score_configs:archive_form_open");
            openDialog();
          },
        })
      }
    </ConfirmationDialogController>
  );
};
