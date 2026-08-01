import { useState } from "react";

import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { EvaluationRuleAttachmentValidationAlert } from "@/src/features/evals/v2/components/production/EvaluationRuleAttachmentValidationAlert";
import { parseEvaluationRuleVariableMapping } from "@/src/features/evals/v2/components/EvaluationRuleEvaluatorList";
import { EvaluationRuleForm } from "@/src/features/evals/v2/components/EvaluationRuleForm";
import { useValidatedRuleAttachment } from "@/src/features/evals/v2/hooks/useValidatedRuleAttachment";
import { getEvaluationRuleMappingReviewHref } from "@/src/features/evals/v2/lib/evaluationRuleMappingReviewHref";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { type AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import {
  type FilterState,
  type ObservationVariableMapping,
} from "@langfuse/shared";

export function EvaluationRuleEditView({
  projectId,
  evaluationRule,
  timeRange,
  onCancel,
  onSaved,
  onOpenTrace,
  readOnly = false,
  initialExpandedEvaluatorId,
}: {
  projectId: string;
  evaluationRule: {
    id: string;
    name: string;
    filter: FilterState;
    sampling: number;
    enabled: boolean;
    evaluators: Array<{
      id: string;
      scoreName: string;
      variableMapping: ObservationVariableMapping[];
    }>;
  };
  timeRange: AbsoluteTimeRange | null;
  onCancel: () => void;
  onSaved: () => void;
  onOpenTrace: (traceId: string) => void;
  readOnly?: boolean;
  initialExpandedEvaluatorId?: string;
}) {
  const utils = api.useUtils();
  const [name, setName] = useState(evaluationRule.name);
  const [filterState, setFilterState] = useState(evaluationRule.filter);
  const [sampling, setSampling] = useState(evaluationRule.sampling);
  const [mappingOverrides, setMappingOverrides] = useState<
    Record<string, ObservationVariableMapping[]>
  >({});
  const [saveConfirmationOpen, setSaveConfirmationOpen] = useState(false);
  const attachment = useValidatedRuleAttachment({
    projectId,
    entryPoint: "evaluation_rule_detail",
  });

  const updateRule = api.evalsV2.updateRule.useMutation({
    onError: (error) => trpcErrorToast(error),
  });
  const detachEvaluator = api.evalsV2.detachEvaluatorFromRule.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: async (_data, variables) => {
      const evaluator = evaluationRule.evaluators.find(
        (candidate) => candidate.id === variables.evaluatorId,
      );
      showSuccessToast({
        title: "Evaluator detached",
        description: evaluator
          ? `“${evaluator.scoreName}” is no longer attached to this evaluation rule.`
          : "The evaluator is no longer attached to this evaluation rule.",
      });
      await Promise.all([utils.evals.invalidate(), utils.evalsV2.invalidate()]);
    },
  });
  const evaluatorOptions = api.evalsV2.evaluatorOptions.useQuery(
    { projectId },
    { enabled: !readOnly },
  );
  const availableEvaluators = (evaluatorOptions.data ?? [])
    .filter((evaluator) => evaluator.targetObject === "event")
    .map((evaluator) => ({
      ...evaluator,
      variableMapping: parseEvaluationRuleVariableMapping(
        evaluator.variableMapping,
      ),
    }));
  const selectedEvaluators = evaluationRule.evaluators.map((evaluator) => ({
    ...evaluator,
    variableMapping:
      mappingOverrides[evaluator.id] ?? evaluator.variableMapping,
  }));
  const evaluatorCount = evaluationRule.evaluators.length;
  const hasChanges =
    name.trim() !== evaluationRule.name ||
    sampling !== evaluationRule.sampling ||
    JSON.stringify(filterState) !== JSON.stringify(evaluationRule.filter) ||
    selectedEvaluators.some(
      (evaluator) =>
        JSON.stringify(evaluator.variableMapping) !==
        JSON.stringify(
          evaluationRule.evaluators.find(
            (initialEvaluator) => initialEvaluator.id === evaluator.id,
          )?.variableMapping,
        ),
    );

  const invalidateAfterSave = () =>
    Promise.all([utils.evals.invalidate(), utils.evalsV2.invalidate()]);
  const save = async () => {
    try {
      await updateRule.mutateAsync({
        projectId,
        ruleId: evaluationRule.id,
        name: name.trim(),
        filter: filterState,
        sampling,
        evaluatorMappings: selectedEvaluators.map((evaluator) => ({
          evaluatorId: evaluator.id,
          mapping: evaluator.variableMapping,
        })),
      });
    } catch {
      return;
    }
    await invalidateAfterSave().catch(() => undefined);

    setSaveConfirmationOpen(false);
    showSuccessToast({
      title: "Rule saved",
      description:
        evaluatorCount > 0
          ? `The changes now apply to ${evaluatorCount} evaluator${evaluatorCount === 1 ? "" : "s"} attached to this rule.`
          : "The evaluation rule was updated.",
    });
    onSaved();
  };

  const requestSave = () => {
    if (evaluatorCount > 0) {
      setSaveConfirmationOpen(true);
      return;
    }
    save().catch(() => undefined);
  };
  const toggleEvaluator = async (evaluatorId: string) => {
    if (readOnly) return;
    const attachedEvaluator = evaluationRule.evaluators.find(
      (evaluator) => evaluator.id === evaluatorId,
    );
    if (attachedEvaluator) {
      await detachEvaluator.mutateAsync({
        projectId,
        evaluatorId,
        ruleId: evaluationRule.id,
      });
      return;
    }

    const evaluator = availableEvaluators.find(
      (candidate) => candidate.id === evaluatorId,
    );
    if (!evaluator) return;
    await attachment.attach({
      evaluatorId,
      ruleId: evaluationRule.id,
      evaluatorName: evaluator.scoreName,
      evaluationRuleName: evaluationRule.name,
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 p-4">
      <EvaluationRuleForm
        projectId={projectId}
        name={name}
        onNameChange={setName}
        filterState={filterState}
        onFilterStateChange={setFilterState}
        sampling={sampling}
        onSamplingChange={setSampling}
        evaluators={selectedEvaluators}
        availableEvaluators={availableEvaluators}
        onToggleEvaluator={toggleEvaluator}
        onEvaluatorMappingChange={(evaluatorId, mapping) =>
          setMappingOverrides((current) => ({
            ...current,
            [evaluatorId]: mapping,
          }))
        }
        timeRange={timeRange}
        onOpenTrace={onOpenTrace}
        evaluatorContent={
          attachment.issue?.requiresMappingReview ? (
            <EvaluationRuleAttachmentValidationAlert
              issue={attachment.issue}
              onDismiss={attachment.dismissIssue}
              reviewHref={getEvaluationRuleMappingReviewHref({
                projectId,
                ruleId: attachment.issue.ruleId,
                evaluatorId: attachment.issue.evaluatorId,
              })}
            />
          ) : null
        }
        defaultSamplingOpen
        defaultEvaluatorOpen={Boolean(initialExpandedEvaluatorId)}
        initialExpandedEvaluatorId={initialExpandedEvaluatorId}
        defaultNameOpen={false}
        nameHint="Changes apply to every evaluator attached to this rule."
        idPrefix="edit-evaluation-rule"
        readOnly={readOnly}
      />

      <div className="flex items-center justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={updateRule.isPending}
          onClick={onCancel}
        >
          {hasChanges ? "Cancel" : "Close"}
        </Button>
        <Button
          type="button"
          loading={updateRule.isPending}
          disabled={readOnly || !name.trim() || !hasChanges}
          onClick={requestSave}
        >
          Save changes
        </Button>
      </div>

      <ConfirmDialog
        open={saveConfirmationOpen}
        onOpenChange={setSaveConfirmationOpen}
        title="Save rule used by evaluators?"
        description={`${evaluatorCount} evaluator${evaluatorCount === 1 ? " is" : "s are"} attached to this evaluation rule. Saving these changes immediately changes which observations ${evaluatorCount === 1 ? "it evaluates" : "they evaluate"}.`}
        confirmLabel="Save changes"
        confirmVariant="default"
        loading={updateRule.isPending}
        onConfirm={save}
      />
    </div>
  );
}
