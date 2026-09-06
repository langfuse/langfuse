import { useHasProjectAccess } from "@/src/features/rbac";
import { Button } from "@/src/components/ui/button";
import { PopoverController } from "@/src/components/ui/popover";
import type * as React from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";
import { useEmptyScoreConfigs } from "@/src/features/scores/hooks/useEmptyConfigs";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("systemUi.scoreConfigs");
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

  const disabled = hasAccess ? undefined : { reason: t("noArchivePermission") };

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
            {isArchived ? t("restoreTitle") : t("archiveTitle")}
          </h2>
          <p className="mb-3 text-sm">
            {isArchived
              ? t("archivedDescription", { name })
              : t("activeDescription", { name })}
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
              {t("confirm")}
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
