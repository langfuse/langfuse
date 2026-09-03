import { showSuccessToast } from "@/src/features/notifications";
import {
  EvalTemplateType,
  observationVariableMappingList,
  singleFilter,
} from "@langfuse/shared";
import { useState } from "react";
import { DialogBody } from "@/src/components/ui/dialog";
import { RuleDialogFooter } from "@/src/features/evals/v2/components/Rules/RuleDialogFooter/RuleDialogFooter";
import { RuleSetup } from "@/src/features/evals/v2/components/Rules/RuleSetup/RuleSetup";
import { createRuleSetupStore } from "@/src/features/evals/v2/stores/createRuleSetupStore";
import { prepareModernRuleVariableMapping } from "@/src/features/evals/v2/fns/variableMapping/prepareModernRuleVariableMapping";
import type { RuleEvaluatorOption } from "@/src/features/evals/v2/types/rules";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api, type RouterOutputs } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type Rule = RouterOutputs["evalsV2"]["rules"]["get"];

export function EditRuleDialogContent({
  projectId,
  rule,
  evaluatorOptions,
  evaluatorSearch,
  onEvaluatorSearchChange,
  hasWriteAccess,
  onClose,
}: {
  projectId: string;
  rule: Rule;
  evaluatorOptions: RuleEvaluatorOption[];
  evaluatorSearch: string;
  onEvaluatorSearchChange: (search: string) => void;
  hasWriteAccess: boolean;
  onClose: () => void;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const [ruleSetupStore] = useState(() =>
    createRuleSetupStore({
      name: rule.name,
      filter: singleFilter.array().catch([]).parse(rule.filter),
      sampling: rule.sampling,
      assignments: rule.assignments.map((assignment) => {
        const preparedDefault = prepareModernRuleVariableMapping(
          assignment.evaluator.latestVersion?.variableMapping,
          assignment.evaluator.type,
        );
        return {
          evaluatorId: assignment.evaluator.id,
          evaluatorName: assignment.evaluator.name,
          evaluatorType: assignment.evaluator.type,
          defaultVariableMapping: preparedDefault.defaultVariableMapping,
          variableMapping:
            assignment.evaluator.type === EvalTemplateType.CODE ||
            assignment.variableMapping == null
              ? preparedDefault.initialVariableMapping
              : observationVariableMappingList
                  .catch([])
                  .parse(assignment.variableMapping),
        };
      }),
    }),
  );
  const update = api.evalsV2.rules.update.useMutation({
    onError: trpcErrorToast,
  });

  const save = async () => {
    const draft = ruleSetupStore.getState();
    const initialIds = new Set(
      rule.assignments.map((assignment) => assignment.evaluator.id),
    );
    const nextIds = new Set(
      draft.assignments.map((assignment) => assignment.evaluatorId),
    );
    const attachedCount = draft.assignments.filter(
      (assignment) => !initialIds.has(assignment.evaluatorId),
    ).length;
    const detachedCount = rule.assignments.filter(
      (assignment) => !nextIds.has(assignment.evaluator.id),
    ).length;
    await update.mutateAsync({
      projectId,
      ruleId: rule.id,
      name: draft.name.trim(),
      filter: draft.filter,
      sampling: draft.sampling,
      evaluatorMappings: draft.assignments.map((assignment) => ({
        evaluatorId: assignment.evaluatorId,
        variableMapping: assignment.variableMapping,
      })),
    });
    capture("evaluation_rules:update", {
      assignmentCount: draft.assignments.length,
      filterCount: draft.filter.length,
      samplingPercent: Math.round(draft.sampling * 100),
      isEnabled: rule.enabled,
    });
    if (attachedCount > 0) {
      capture("evaluation_rules:attach_evaluator", {
        evaluatorCount: attachedCount,
        source: "rule_detail",
      });
    }
    if (detachedCount > 0) {
      capture("evaluation_rules:detach_evaluator", {
        evaluatorCount: detachedCount,
        source: "rule_detail",
      });
    }
    showSuccessToast({
      title: "Rule saved",
      description: "Your changes have been saved.",
    });
    await Promise.all([
      utils.evalsV2.rules.list.invalidate({ projectId }),
      utils.evalsV2.rules.filterOptions.invalidate({ projectId }),
      utils.evalsV2.rules.get.invalidate({ projectId, ruleId: rule.id }),
      utils.evalsV2.list.invalidate({ projectId }),
    ]);
    onClose();
  };

  return (
    <>
      <DialogBody>
        <fieldset disabled={!hasWriteAccess} className="contents">
          <RuleSetup
            projectId={projectId}
            evaluatorOptions={evaluatorOptions}
            evaluatorSearch={evaluatorSearch}
            onEvaluatorSearchChange={onEvaluatorSearchChange}
            store={ruleSetupStore}
            nameAIAssistance={{ state: "unavailable" }}
            onNameStepOpenChange={() => undefined}
          />
        </fieldset>
      </DialogBody>
      <RuleDialogFooter
        ruleSetupStore={ruleSetupStore}
        mutationPending={update.isPending}
        nameGenerationPending={false}
        isEditing
        canEdit={hasWriteAccess}
        nameAIAssistanceAvailable={false}
        onCancel={onClose}
        onSave={() => save().catch(() => undefined)}
      />
    </>
  );
}
