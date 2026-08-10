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
import {
  useCanUseInAppAgent,
  useInAppAiAgent,
} from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";

type EvaluatorMigrationScope = { type: "all" } | { type: "single" };

type EvaluatorMigrationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: EvaluatorMigrationScope;
  assistantPrompt: string;
  onManualMigration: () => void;
  onAssistantStarted: () => void;
};

type SelectedMigrationAction = "assistant" | "manual";

export function EvaluatorMigrationDialog({
  open,
  onOpenChange,
  scope,
  assistantPrompt,
  onManualMigration,
  onAssistantStarted,
}: EvaluatorMigrationDialogProps) {
  const canUseAssistant = useCanUseInAppAgent();
  const { organization } = useQueryProjectOrOrganization();
  const { openAssistant, submit } = useInAppAiAgent();
  const [selectedAction, setSelectedAction] =
    useState<SelectedMigrationAction | null>(null);

  const aiFeaturesEnabled = Boolean(organization?.aiFeaturesEnabled);
  const isSingleEvaluator = scope.type === "single";

  const startAssistant = async () => {
    const opened = openAssistant("v4_migration");
    if (!opened) return;

    onAssistantStarted();
    onOpenChange(false);
    await submit(assistantPrompt, { newConversation: true });
  };

  const handleAssistantClick = () => {
    setSelectedAction("assistant");
    if (!aiFeaturesEnabled) {
      openAssistant("v4_migration");
    }
  };

  const handleManualClick = () => {
    if (isSingleEvaluator) {
      setSelectedAction("manual");
      return;
    }
    onManualMigration();
  };

  return (
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
              : selectedAction === "manual"
                ? "Ready to migrate this evaluator?"
                : isSingleEvaluator
                  ? "How would you like to migrate this evaluator?"
                  : "How would you like to migrate your evaluators?"}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="gap-3">
          {selectedAction === "assistant" ? (
            <p className="text-muted-foreground text-sm">
              {aiFeaturesEnabled
                ? "The Assistant will review your deprecated evaluators and suggest upgrading all of them at once."
                : "Enable AI features in the dialog above, then return here to start the upgrade with the Assistant."}
            </p>
          ) : selectedAction === "manual" ? (
            <p className="text-muted-foreground text-sm">
              Open the evaluator upgrade form to review the legacy configuration
              and create its replacement.
            </p>
          ) : (
            <>
              {canUseAssistant ? (
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
                      ? "Migrate just this evaluator"
                      : "Migrate manually"}
                  </span>
                  <span className="text-muted-foreground text-sm font-normal">
                    {isSingleEvaluator
                      ? "Open the evaluator upgrade form."
                      : "Review each evaluator marked Deprecated and migrate it individually."}
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
            {selectedAction === "assistant" ? (
              <Button
                type="button"
                onClick={startAssistant}
                disabled={!aiFeaturesEnabled}
              >
                Start upgrade now
              </Button>
            ) : (
              <Button type="button" onClick={onManualMigration}>
                Start now
              </Button>
            )}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
