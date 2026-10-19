import type * as React from "react";
import { useState } from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useHasProjectAccess } from "@/src/features/rbac";
import { useEmptyScoreConfigs } from "@/src/features/scores";
import { api } from "@/src/utils/api";

export type ArchiveScoreConfigState = {
  id: string;
  isArchived: boolean;
  name: string;
};

export const ArchiveScoreConfigDialogController = ({
  children,
  projectId,
}: {
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: (config: ArchiveScoreConfigState) => void;
  }) => React.ReactNode;
  projectId: string;
}) => {
  const [selectedConfig, setSelectedConfig] =
    useState<ArchiveScoreConfigState | null>(null);
  const capture = usePostHogClientCapture();
  const { emptySelectedConfigIds, setEmptySelectedConfigIds } =
    useEmptyScoreConfigs();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scoreConfigs:CUD",
  });
  const utils = api.useUtils();
  const mutation = api.scoreConfigs.update.useMutation({
    onSuccess: () => utils.scoreConfigs.invalidate(),
  });
  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to archive this score config." };

  return (
    <ConfirmationDialogController
      title={selectedConfig?.isArchived ? "Restore config" : "Archive config"}
      text={
        selectedConfig?.isArchived
          ? `Your config is currently archived. Restore if you want to use "${selectedConfig.name}" in annotation again.`
          : `Your config is currently active. Archive if you no longer want to use "${selectedConfig?.name ?? "this config"}" in annotation. Historic scores will still be shown and can be deleted. You can restore your config at any point.`
      }
      confirmLabel="Confirm"
      variant={selectedConfig?.isArchived ? "default" : "destructive"}
      loading={mutation.isPending}
      onConfirm={async () => {
        if (!selectedConfig) return;

        await mutation.mutateAsync({
          projectId,
          id: selectedConfig.id,
          isArchived: !selectedConfig.isArchived,
        });
        setEmptySelectedConfigIds(
          emptySelectedConfigIds.filter((id) => id !== selectedConfig.id),
        );
        capture("score_configs:archive_form_submit");
      }}
    >
      {({ openDialog }) =>
        children({
          disabled,
          openDialog: (config) => {
            setSelectedConfig(config);
            capture("score_configs:archive_form_open");
            openDialog();
          },
        })
      }
    </ConfirmationDialogController>
  );
};
