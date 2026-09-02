import { useHasProjectAccess } from "@/src/features/rbac";
import { Button } from "@/src/components/ui/button";
import { PopoverController } from "@/src/components/ui/popover";
import type * as React from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";
import { useEmptyScoreConfigs } from "@/src/features/scores/hooks/useEmptyConfigs";

type ArchiveScoreConfigPopoverControllerProps = {
  children: (
    control: Omit<
      Parameters<React.ComponentProps<typeof PopoverController>["children"]>[0],
      "disabled"
    > & { disabled: { reason: string } | undefined },
  ) => React.ReactNode;
  configId: string;
  projectId: string;
  isArchived: boolean;
  name: string;
};

export const ArchiveScoreConfigPopoverController = ({
  children,
  configId,
  projectId,
  isArchived,
  name,
}: ArchiveScoreConfigPopoverControllerProps) => {
  const capture = usePostHogClientCapture();
  const { emptySelectedConfigIds, setEmptySelectedConfigIds } =
    useEmptyScoreConfigs();

  const hasAccess = useHasProjectAccess({
    projectId: projectId,
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
    <PopoverController
      align="center"
      contentClassName="max-w-[500px]"
      disabled={disabled !== undefined}
      modal
      onOpenChange={(isOpen) => {
        if (isOpen && hasAccess) {
          capture("score_configs:archive_form_open");
        }
      }}
      renderContent={() => (
        <>
          <h2 className="mb-3 font-bold">
            {isArchived ? "Restore config" : "Archive config"}
          </h2>
          <p className="mb-3 text-sm">
            Your config is currently{" "}
            {isArchived
              ? `archived. Restore if you want to use "${name}" in annotation again.`
              : `active. Archive if you no longer want to use "${name}" in annotation. Historic "${name}" scores will still be shown and can be deleted. You can restore your config at any point.`}
          </p>
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant={isArchived ? "default" : "destructive"}
              loading={configMutation.isPending}
              onClick={() => {
                configMutation.mutateAsync({
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
              Confirm
            </Button>
          </div>
        </>
      )}
    >
      {({ Anchor, isOpen, openPopover, Trigger }) =>
        children({ disabled, isOpen, openPopover, Anchor, Trigger })
      }
    </PopoverController>
  );
};
