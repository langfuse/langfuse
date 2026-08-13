import {
  EvalTemplateType,
  observationVariableMappingList,
  singleFilter,
} from "@langfuse/shared";
import { useState } from "react";
import { DialogBody } from "@/src/components/ui/dialog";
import { ActivationConfirmationDialog } from "@/src/features/evals/v2/components/Rules/ActivationConfirmationDialog/ActivationConfirmationDialog";
import { RuleDialogFooter } from "@/src/features/evals/v2/components/Rules/RuleDialogFooter/RuleDialogFooter";
import { RuleSetup } from "@/src/features/evals/v2/components/Rules/RuleSetup/RuleSetup";
import { useActivationConfirmation } from "@/src/features/evals/v2/hooks/useActivationConfirmation";
import { createRuleSetupStore } from "@/src/features/evals/v2/stores/createRuleSetupStore";
import type { RuleEvaluatorOption } from "@/src/features/evals/v2/types/rules";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api, type RouterOutputs } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type Rule = RouterOutputs["evalsV2"]["rules"]["get"];

export function EditRuleDialogContent({
  projectId,
  rule,
  evaluatorOptions,
  evaluatorSearch,
  onEvaluatorSearchChange,
  canEdit,
  onClose,
}: {
  projectId: string;
  rule: Rule;
  evaluatorOptions: RuleEvaluatorOption[];
  evaluatorSearch: string;
  onEvaluatorSearchChange: (search: string) => void;
  canEdit: boolean;
  onClose: () => void;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const [ruleSetupStore] = useState(() =>
    createRuleSetupStore({
      name: rule.name,
      filter: singleFilter.array().catch([]).parse(rule.filter),
      sampling: rule.sampling,
      assignments: rule.assignments.map((assignment) => ({
        evaluatorId: assignment.evaluator.id,
        evaluatorName: assignment.evaluator.name,
        defaultVariableMapping: observationVariableMappingList
          .catch([])
          .parse(assignment.evaluator.latestVersion?.variableMapping),
        variableMapping:
          assignment.variableMapping == null
            ? null
            : observationVariableMappingList
                .catch([])
                .parse(assignment.variableMapping),
      })),
    }),
  );
  const activation = useActivationConfirmation({ projectId });
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
      utils.evalsV2.rules.get.invalidate({ projectId, ruleId: rule.id }),
      utils.evalsV2.list.invalidate({ projectId }),
    ]);
    onClose();
  };

  const requestSave = async () => {
    const draft = ruleSetupStore.getState();
    const initialIds = new Set(
      rule.assignments.map((assignment) => assignment.evaluator.id),
    );
    const initialFilter = singleFilter.array().catch([]).parse(rule.filter);
    const matchScopeChanged =
      rule.sampling !== draft.sampling ||
      JSON.stringify(initialFilter) !== JSON.stringify(draft.filter);
    const affectedLlmEvaluatorIds = draft.assignments
      .filter(
        (assignment) =>
          matchScopeChanged || !initialIds.has(assignment.evaluatorId),
      )
      .filter(
        (assignment) =>
          (evaluatorOptions.find(
            (evaluator) => evaluator.id === assignment.evaluatorId,
          )?.type ??
            rule.assignments.find(
              ({ evaluator }) => evaluator.id === assignment.evaluatorId,
            )?.evaluator.type) === EvalTemplateType.LLM_AS_JUDGE,
      )
      .map((assignment) => assignment.evaluatorId);

    await activation.requestActivation({
      targets: rule.enabled
        ? affectedLlmEvaluatorIds.map((evaluatorId) => ({
            evaluatorId,
            evaluatorName:
              draft.assignments.find(
                (assignment) => assignment.evaluatorId === evaluatorId,
              )?.evaluatorName ?? "LLM evaluator",
            filter: draft.filter,
            sampling: draft.sampling,
          }))
        : [],
      title: matchScopeChanged
        ? "Update active evaluation rule?"
        : "Attach LLM evaluator?",
      description:
        "This rule is active. Based on matching observations from the last seven days and the latest evaluator test calls:",
      confirmLabel: matchScopeChanged ? "Save changes" : "Save and attach",
      onConfirm: async (sampling) => {
        if (sampling !== undefined) {
          ruleSetupStore.getState().actions.setSampling(sampling);
        }
        await save();
      },
    });
  };

  return (
    <>
      <DialogBody>
        <RuleSetup
          projectId={projectId}
          evaluatorOptions={evaluatorOptions}
          evaluatorSearch={evaluatorSearch}
          onEvaluatorSearchChange={onEvaluatorSearchChange}
          store={ruleSetupStore}
          nameAIAssistance={{ state: "unavailable" }}
          onNameStepOpenChange={() => undefined}
        />
      </DialogBody>
      <RuleDialogFooter
        ruleSetupStore={ruleSetupStore}
        activationPending={activation.estimate.status === "estimating"}
        mutationPending={update.isPending}
        isEditing
        canEdit={canEdit}
        onCancel={onClose}
        onSave={() => requestSave().catch(() => undefined)}
      />
      <ActivationConfirmationDialog
        confirmation={activation.confirmation}
        estimate={activation.estimate}
        onOpenChange={activation.setOpen}
        onSamplingChange={activation.setSampling}
        onConfirm={() => activation.confirmActivation().catch(() => undefined)}
      />
    </>
  );
}
