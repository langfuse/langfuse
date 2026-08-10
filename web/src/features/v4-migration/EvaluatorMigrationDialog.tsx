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
  useCanUseInAppAgent,
  useInAppAiAgent,
} from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

type EvaluatorMigrationScope = { type: "all" } | { type: "single" };

type EvaluatorMigrationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: EvaluatorMigrationScope;
  assistantPrompt: string;
  onManualUpgrade: () => void;
  onAssistantStarted: () => void;
};

type SelectedMigrationAction = "assistant";

const ADMIN_REQUEST_MESSAGE =
  "Hi! Could you enable AI features for our Langfuse organization? I need them to use the Assistant to upgrade our deprecated evaluators for v4. Thanks!";

export function EvaluatorMigrationDialog({
  open,
  onOpenChange,
  scope,
  assistantPrompt,
  onManualUpgrade,
  onAssistantStarted,
}: EvaluatorMigrationDialogProps) {
  const canUseAssistant = useCanUseInAppAgent();
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
  const showAssistantOption = canUseAssistant;

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
    if (isSingleEvaluator) {
      onManualUpgrade();
      return;
    }
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
              {selectedAction === "assistant"
                ? "Ready to start your evaluator upgrade?"
                : isSingleEvaluator
                  ? "How would you like to upgrade this evaluator?"
                  : "How would you like to upgrade your evaluators?"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="gap-3">
            {selectedAction === "assistant" ? (
              <p className="text-muted-foreground text-sm">
                {aiFeaturesEnabled
                  ? "The Assistant will review your deprecated evaluators and suggest upgrading all of them at once."
                  : "Enable AI features in the other tab, then return here to start the upgrade with the Assistant."}
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
                      <span className="font-semibold">Use Assistant</span>
                      <span className="text-muted-foreground text-sm font-normal">
                        Suggest upgrading all deprecated evaluators at once.
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
                    <span className="font-semibold">
                      {isSingleEvaluator
                        ? "Upgrade just this evaluator"
                        : "Upgrade manually"}
                    </span>
                    <span className="text-muted-foreground text-sm font-normal">
                      {isSingleEvaluator ? (
                        "Open the evaluator upgrade form."
                      ) : (
                        <>
                          Click evaluators with the Deprecated label to review{" "}
                          <br />
                          them and start each upgrade individually.
                        </>
                      )}
                    </span>
                  </span>
                </Button>
              </>
            )}
          </DialogBody>
          {selectedAction ? (
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSelectedAction(null);
                }}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={startAssistant}
                disabled={!aiFeaturesEnabled}
              >
                Start upgrade now
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={orgAdminNoticeOpen} onOpenChange={setOrgAdminNoticeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Ask your organization admin to enable AI features
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="gap-3">
            <p className="text-muted-foreground text-sm">
              The Assistant can help you upgrade all deprecated evaluators at
              once. An organization admin needs to enable AI features for your
              organization before you can use it.
            </p>
            <a
              href="https://langfuse.com/security/ai-features"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary text-sm underline"
            >
              Learn more about AI features
            </a>
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-sm">
                You can send your admin this message:
              </p>
              <CodeBlock language="text" value={ADMIN_REQUEST_MESSAGE} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeOrgAdminNotice}
            >
              Close
            </Button>
            {isSingleEvaluator ? (
              <Button
                type="button"
                onClick={() => {
                  setOrgAdminNoticeOpen(false);
                  onManualUpgrade();
                }}
              >
                Start manual upgrade
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
