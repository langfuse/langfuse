import { BotMessageSquare, Wrench } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { CodeBlock } from "@/src/components/design-system/Codeblock/Codeblock";
import {
  useIsInAppAgentLauncherVisible,
  useInAppAiAgent,
} from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useTranslations } from "next-intl";

type EvaluatorMigrationScope = { type: "all" } | { type: "single" };

type EvaluatorMigrationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: EvaluatorMigrationScope;
  assistantPrompt: string;
  onManualUpgrade: () => void;
  onAssistantStarted: () => void;
  /** Opens the dialog with this action already selected, skipping the
   *  choice screen. Only honored while AI features are enabled — otherwise
   *  the choice screen keeps owning the enable-AI and admin-handoff flows. */
  initialAction?: SelectedMigrationAction;
};

type SelectedMigrationAction = "assistant";

export function EvaluatorMigrationDialog({
  open,
  onOpenChange,
  scope,
  assistantPrompt,
  onManualUpgrade,
  onAssistantStarted,
  initialAction,
}: EvaluatorMigrationDialogProps) {
  const t = useTranslations("remainderUi.migrations");
  const isInAppAgentLauncherVisible = useIsInAppAgentLauncherVisible();
  const { organization } = useQueryProjectOrOrganization();
  const { openAssistant, submit } = useInAppAiAgent();
  const canUpdateOrgSettings = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organization:update",
  });
  const [selectedAction, setSelectedAction] =
    useState<SelectedMigrationAction | null>(null);
  const [orgAdminNoticeOpen, setOrgAdminNoticeOpen] = useState(false);

  const aiFeaturesEnabled = Boolean(organization?.aiFeaturesEnabled);
  const isSingleEvaluator = scope.type === "single";
  const showAssistantOption = isInAppAgentLauncherVisible;
  // With AI features disabled, the choice screen's assistant option owns the
  // enable-AI and admin-handoff side effects, so the preselect only applies
  // once the assistant can actually start.
  const effectiveAction =
    selectedAction ??
    (initialAction === "assistant" && showAssistantOption && aiFeaturesEnabled
      ? "assistant"
      : null);

  const capture = usePostHogClientCapture();
  const startAssistant = async () => {
    const opened = openAssistant("v4_migration");
    if (!opened) return;

    onAssistantStarted();
    onOpenChange(false);
    await submit(assistantPrompt, { newConversation: true });
  };

  const handleAssistantClick = () => {
    if (!aiFeaturesEnabled && !canUpdateOrgSettings) {
      onOpenChange(false);
      setOrgAdminNoticeOpen(true);
      return;
    }

    setSelectedAction("assistant");
    if (!aiFeaturesEnabled) {
      openAssistant("v4_migration");
    }
  };

  const handleManualClick = () => {
    // The assistant branch is covered by in_app_agent:new_chat_started
    // (entryPoint "v4_migration"); this event completes the funnel fork.
    capture("v4_migration:evals_manual_upgrade_clicked", {
      scope: isSingleEvaluator ? "single" : "bulk",
    });
    onManualUpgrade();
  };

  const closeOrgAdminNotice = () => {
    setOrgAdminNoticeOpen(false);
    if (!isSingleEvaluator) {
      onOpenChange(true);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSelectedAction(null);
          onOpenChange(nextOpen);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {effectiveAction === "assistant"
                ? t("dialog.readyTitle")
                : isSingleEvaluator
                  ? t("dialog.singleTitle")
                  : t("dialog.bulkTitle")}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="gap-3">
            {effectiveAction === "assistant" ? (
              <p className="text-muted-foreground text-sm">
                {aiFeaturesEnabled
                  ? t("dialog.assistantEnabledDescription")
                  : t("dialog.assistantDisabledDescription")}
              </p>
            ) : (
              <>
                {showAssistantOption ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto justify-start gap-3 p-4 text-left"
                    onClick={handleAssistantClick}
                  >
                    <BotMessageSquare className="h-5 w-5 shrink-0" />
                    <span className="flex flex-col gap-1">
                      <span className="font-bold">
                        {t("common.useAssistant")}
                      </span>
                      <span className="text-muted-foreground text-sm font-normal">
                        {t("dialog.assistantOptionDescription")}
                      </span>
                    </span>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto justify-start gap-3 p-4 text-left"
                  onClick={handleManualClick}
                >
                  <Wrench className="h-5 w-5 shrink-0" />
                  <span className="flex flex-col gap-1">
                    <span className="font-bold">
                      {isSingleEvaluator
                        ? t("dialog.upgradeSingle")
                        : t("dialog.upgradeManually")}
                    </span>
                    <span className="text-muted-foreground text-sm font-normal">
                      {isSingleEvaluator
                        ? t("dialog.openUpgradeForm")
                        : t("dialog.manualDescription")}
                    </span>
                  </span>
                </Button>
              </>
            )}
          </DialogBody>
          {effectiveAction ? (
            <DialogFooter>
              {/* Back returns to the choice screen; when the dialog opened
                  preselected there is no choice screen to go back to. */}
              {selectedAction ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectedAction(null);
                  }}
                >
                  {t("common.back")}
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={startAssistant}
                disabled={!aiFeaturesEnabled}
              >
                {t("dialog.startUpgradeNow")}
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={orgAdminNoticeOpen} onOpenChange={setOrgAdminNoticeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialog.askAdminTitle")}</DialogTitle>
          </DialogHeader>
          <DialogBody className="gap-3">
            <p className="text-muted-foreground text-sm">
              {t("dialog.askAdminDescription")}
            </p>
            <a
              href="https://langfuse.com/security/ai-features"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary text-sm underline"
            >
              {t("dialog.learnAiFeatures")}
            </a>
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-sm">
                {t("dialog.sendAdminMessage")}
              </p>
              <CodeBlock
                language="text"
                value={t("dialog.adminRequestMessage")}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeOrgAdminNotice}
            >
              {t("common.close")}
            </Button>
            {isSingleEvaluator ? (
              <Button
                type="button"
                onClick={() => {
                  setOrgAdminNoticeOpen(false);
                  onManualUpgrade();
                }}
              >
                {t("dialog.startManualUpgrade")}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
