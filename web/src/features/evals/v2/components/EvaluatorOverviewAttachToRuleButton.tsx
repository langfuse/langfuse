import { useState } from "react";
import { Link2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { CreateEvaluationRuleDialog } from "@/src/features/evals/v2/components/CreateEvaluationRuleDialog";
import { EvaluationRuleAttachmentValidationAlert } from "@/src/features/evals/v2/components/production/EvaluationRuleAttachmentValidationAlert";
import { EvaluationRulePicker } from "@/src/features/evals/v2/components/production/EvaluationRulePicker";
import { useValidatedRuleAttachment } from "@/src/features/evals/v2/hooks/useValidatedRuleAttachment";
import { getEvaluationRuleMappingReviewHref } from "@/src/features/evals/v2/lib/evaluationRuleMappingReviewHref";
import { api } from "@/src/utils/api";

export function EvaluatorOverviewAttachToRuleButton({
  projectId,
  evaluatorId,
  evaluatorName,
  hasWriteAccess,
}: {
  projectId: string;
  evaluatorId: string;
  evaluatorName: string;
  hasWriteAccess: boolean;
}) {
  const [rulePickerOpen, setRulePickerOpen] = useState(false);
  const [createRuleDialogOpen, setCreateRuleDialogOpen] = useState(false);
  const attachment = useValidatedRuleAttachment({
    projectId,
    entryPoint: "evaluator_overview",
  });
  const availableRules = api.evalsV2.rules.useQuery(
    { projectId },
    { enabled: rulePickerOpen },
  );
  const evaluator = api.evals.configById.useQuery(
    { projectId, id: evaluatorId },
    { enabled: rulePickerOpen },
  );
  const attachedRuleIds = new Set(
    evaluator.data?.ruleAssignments.map(({ rule }) => rule.id) ?? [],
  );
  const compatibleRules = (availableRules.data ?? []).filter(
    (rule) => rule.targetObject === "event" && !attachedRuleIds.has(rule.id),
  );

  return (
    <>
      <EvaluationRulePicker
        trigger={(open) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-label="Attach to rule"
            aria-expanded={open}
            loading={attachment.pendingKey !== null}
            disabled={!hasWriteAccess || attachment.pendingKey !== null}
          >
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            Attach to rule
          </Button>
        )}
        availableRules={compatibleRules}
        loading={availableRules.isPending || evaluator.isPending}
        align="end"
        onOpenChange={setRulePickerOpen}
        onSelectAvailableRule={(rule) => {
          attachment
            .attach({
              evaluatorId,
              ruleId: rule.id,
              evaluatorName,
              evaluationRuleName: rule.name,
            })
            .catch(() => undefined);
        }}
        onCreateRule={() => setCreateRuleDialogOpen(true)}
      />

      <Dialog
        open={attachment.issue?.requiresMappingReview ?? false}
        onOpenChange={(open) => {
          if (!open) attachment.dismissIssue();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="sr-only">
              Review evaluator variable mapping
            </DialogTitle>
          </DialogHeader>
          {attachment.issue?.requiresMappingReview ? (
            <DialogBody>
              <EvaluationRuleAttachmentValidationAlert
                issue={attachment.issue}
                onDismiss={attachment.dismissIssue}
                reviewHref={getEvaluationRuleMappingReviewHref({
                  projectId,
                  ruleId: attachment.issue.ruleId,
                  evaluatorId,
                })}
              />
            </DialogBody>
          ) : null}
        </DialogContent>
      </Dialog>

      {createRuleDialogOpen ? (
        <CreateEvaluationRuleDialog
          projectId={projectId}
          open
          onOpenChange={setCreateRuleDialogOpen}
          initialEvaluatorIds={[evaluatorId]}
        />
      ) : null}
    </>
  );
}
