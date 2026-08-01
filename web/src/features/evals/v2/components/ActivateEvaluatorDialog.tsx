import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Label } from "@/src/components/ui/label";
import { ActivationCostEstimate } from "@/src/features/evals/v2/components/ActivationCostEstimate";
import { EvaluationRulePicker } from "@/src/features/evals/v2/components/production/EvaluationRulePicker";
import { useValidatedRuleAttachment } from "@/src/features/evals/v2/hooks/useValidatedRuleAttachment";
import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";

const NEW_RULE_DESTINATION = "new-rule";

export function ActivateEvaluatorDialog({
  projectId,
  evaluatorId,
  evaluatorName,
  attachedRuleIds,
  setupFilter,
  setupSampling,
  testRunCostUsd,
  isCodeEvaluator,
  open,
  onOpenChange,
  onComplete,
  onCreateRule,
  onReviewRule,
}: {
  projectId: string;
  evaluatorId: string;
  evaluatorName: string;
  attachedRuleIds: string[];
  setupFilter: FilterState;
  setupSampling: number;
  testRunCostUsd: number | null;
  isCodeEvaluator: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  onCreateRule: () => void;
  onReviewRule: (ruleId: string) => void;
}) {
  const [selectedDestination, setSelectedDestination] = useState<string | null>(
    null,
  );
  const attachment = useValidatedRuleAttachment({
    projectId,
    entryPoint: "evaluator_detail",
  });
  const rules = api.evalsV2.rules.useQuery(
    { projectId },
    { enabled: open, refetchOnWindowFocus: false },
  );
  const attachedRuleIdSet = new Set(attachedRuleIds);
  const compatibleRules = (rules.data ?? []).filter(
    (rule) => rule.targetObject === "event" && !attachedRuleIdSet.has(rule.id),
  );
  const destination = selectedDestination;
  const selectedRule = compatibleRules.find((rule) => rule.id === destination);
  const destinationLabel =
    destination === NEW_RULE_DESTINATION
      ? "Create a new rule"
      : selectedRule?.name;
  const isPending = attachment.pendingKey !== null;

  const activate = async () => {
    if (destination === NEW_RULE_DESTINATION) {
      onCreateRule();
      return;
    }
    if (!selectedRule) return;

    const result = await attachment.attach({
      evaluatorId,
      ruleId: selectedRule.id,
      evaluatorName,
      evaluationRuleName: selectedRule.name,
    });
    if (!result.attached) return;
    if (result.issue?.requiresMappingReview) {
      onReviewRule(selectedRule.id);
      return;
    }
    if (result.issue) {
      toast.warning("Evaluator attached, but validation needs attention", {
        description: result.issue.message,
      });
    }
    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" closeOnInteractionOutside>
        <DialogHeader variant="action">
          <DialogTitle>Evaluator saved successfully</DialogTitle>
        </DialogHeader>

        <DialogBody className="gap-4">
          <DialogDescription>
            Your evaluator is ready. Run it automatically on incoming production
            observations by creating a rule or attaching it to an existing one.
          </DialogDescription>

          <div className="flex flex-col gap-2">
            <div>
              <Label>Choose a rule</Label>
              <p className="text-muted-foreground text-sm">
                The evaluator will run on incoming observations matched by this
                rule.
              </p>
            </div>
            <EvaluationRulePicker
              trigger={(pickerOpen) => (
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-label="Choose a rule"
                  aria-expanded={pickerOpen}
                  className="w-full justify-between font-normal"
                  disabled={isPending}
                >
                  <span
                    className="truncate"
                    title={destinationLabel ?? "Select a rule"}
                  >
                    {destinationLabel ?? "Select a rule"}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              )}
              availableRules={compatibleRules}
              selectedRuleId={
                destination === NEW_RULE_DESTINATION ? null : destination
              }
              loading={rules.isPending}
              onSelectAvailableRule={(rule) => setSelectedDestination(rule.id)}
              onCreateRule={() => setSelectedDestination(NEW_RULE_DESTINATION)}
            />
          </div>

          <ActivationCostEstimate
            projectId={projectId}
            evaluatorId={evaluatorId}
            filter={selectedRule?.filter ?? setupFilter}
            sampling={selectedRule?.sampling ?? setupSampling}
            testRunCostUsd={testRunCostUsd}
            isCodeEvaluator={isCodeEvaluator}
            enabled={open}
          />
        </DialogBody>

        <DialogFooter variant="action">
          <Button type="button" variant="outline" onClick={onComplete}>
            Not now
          </Button>
          <Button
            type="button"
            loading={isPending}
            disabled={!destination}
            onClick={() => activate().catch(() => undefined)}
          >
            {destination === NEW_RULE_DESTINATION ? (
              <>
                <Plus className="mr-1.5 h-4 w-4" />
                Configure new rule
              </>
            ) : (
              "Attach and run"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
