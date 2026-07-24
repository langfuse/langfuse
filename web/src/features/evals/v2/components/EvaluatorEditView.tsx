import { useRef, useState } from "react";

import {
  EVALUATION_OBSERVATION_EXCLUSION_FILTERS,
  generateEvaluationRuleName,
} from "@/src/features/evals/v2/components/EvaluationRuleSection";
import { areFilterStatesEquivalent } from "@/src/features/evals/v2/lib/filterStateEquality";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  EvaluatorSetupForm,
  type EvaluatorSetupRuleTab,
  type CatalogTemplate,
} from "@/src/features/evals/v2/components/EvaluatorSetupForm";
import { CreateEvaluatorActivationDialog } from "@/src/features/evals/v2/components/CreateEvaluatorActivationDialog";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import {
  type FilterState,
  type ObservationVariableMapping,
} from "@langfuse/shared";

const INITIAL_NEW_RULE_ID = "new-rule-1";

type RuleDraft = EvaluatorSetupRuleTab & {
  evaluatorCount: number;
  isNew: boolean;
};

function ruleConfigChanged(
  draft: RuleDraft,
  original:
    | {
        filter: FilterState;
        sampling: number;
      }
    | undefined,
) {
  return (
    draft.isNew ||
    !original ||
    !areFilterStatesEquivalent(draft.filter, original.filter) ||
    draft.sampling !== original.sampling
  );
}

export function EvaluatorEditView({
  projectId,
  evaluatorId,
  sourceTemplate,
  initialMapping,
  scoreName,
  description,
  attachedRuleIds,
  initialEvaluationRuleId,
  onSaved,
  onCancel,
}: {
  projectId: string;
  evaluatorId: string;
  sourceTemplate: CatalogTemplate;
  initialMapping: ObservationVariableMapping[];
  scoreName: string;
  description: string;
  attachedRuleIds: string[];
  initialEvaluationRuleId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [draftScoreName, setDraftScoreName] = useState(scoreName);
  const [draftDescription, setDraftDescription] = useState(description);
  const [selectedRuleId, setSelectedRuleId] = useState(
    initialEvaluationRuleId && attachedRuleIds.includes(initialEvaluationRuleId)
      ? initialEvaluationRuleId
      : (attachedRuleIds[0] ?? INITIAL_NEW_RULE_ID),
  );
  const [ruleEdits, setRuleEdits] = useState<
    Record<string, { filter: FilterState; sampling: number }>
  >({});
  const [newRules, setNewRules] = useState<RuleDraft[]>([]);
  const [removedRuleIds, setRemovedRuleIds] = useState<string[]>([]);
  const [pendingRuleDrafts, setPendingRuleDrafts] = useState<RuleDraft[]>([]);
  const [pendingRemovedRuleIds, setPendingRemovedRuleIds] = useState<string[]>(
    [],
  );
  const [pendingTestRunCostUsd, setPendingTestRunCostUsd] = useState<
    number | null
  >(null);
  const [pendingSaveChoice, setPendingSaveChoice] = useState<
    "activation" | null
  >(null);
  const pendingSaveResolver = useRef<
    ((shouldContinue: boolean) => void) | null
  >(null);
  const nextNewRuleNumberRef = useRef(attachedRuleIds.length > 0 ? 1 : 2);
  const utils = api.useUtils();
  const rules = api.evalsV2.rules.useQuery({ projectId });
  const updateRule = api.evalsV2.updateRule.useMutation({
    onError: (error) => trpcErrorToast(error),
  });
  const createRule = api.evalsV2.createRule.useMutation({
    onError: (error) => trpcErrorToast(error),
  });
  const detachEvaluatorFromRule =
    api.evalsV2.detachEvaluatorFromRule.useMutation({
      onError: (error) => trpcErrorToast(error),
    });

  if (rules.isPending) {
    return <Skeleton className="m-6 h-96 w-auto" />;
  }

  const allAttachedRules = (rules.data ?? []).filter(
    (rule) =>
      rule.targetObject === "event" && attachedRuleIds.includes(rule.id),
  );
  const attachedRules = allAttachedRules.filter(
    (rule) => !removedRuleIds.includes(rule.id),
  );
  const implicitNewRule: RuleDraft = {
    id: INITIAL_NEW_RULE_ID,
    name: "New rule",
    filter: EVALUATION_OBSERVATION_EXCLUSION_FILTERS,
    sampling: 1,
    evaluatorCount: 0,
    isNew: true,
  };
  const ruleTabs: RuleDraft[] = (
    attachedRules.length > 0
      ? attachedRules.map((rule) => ({
          ...rule,
          isNew: false,
        }))
      : newRules.length === 0
        ? [implicitNewRule]
        : []
  )
    .concat(newRules)
    .map((rule) => ({ ...rule, ...ruleEdits[rule.id] }));
  const selectedRule =
    ruleTabs.find((rule) => rule.id === selectedRuleId) ?? ruleTabs[0];
  const changedRuleDrafts = ruleTabs.filter((draft) =>
    ruleConfigChanged(
      draft,
      allAttachedRules.find((rule) => rule.id === draft.id),
    ),
  );
  const hasRuleChanges =
    changedRuleDrafts.length > 0 || removedRuleIds.length > 0;
  const ruleSavePending =
    updateRule.isPending ||
    createRule.isPending ||
    detachEvaluatorFromRule.isPending;

  const finishRuleSaveChoice = (shouldContinue: boolean) => {
    setPendingRuleDrafts([]);
    setPendingRemovedRuleIds([]);
    setPendingTestRunCostUsd(null);
    setPendingSaveChoice(null);
    const resolve = pendingSaveResolver.current;
    pendingSaveResolver.current = null;
    resolve?.(shouldContinue);
  };

  const invalidateRules = () =>
    Promise.all([
      utils.evalsV2.rules.invalidate({ projectId }),
      utils.evalsV2.invalidate(),
      utils.evals.configById.invalidate({ projectId, id: evaluatorId }),
    ]);

  const persistRuleChanges = async ({
    drafts,
    removedIds,
  }: {
    drafts: RuleDraft[];
    removedIds: string[];
  }) => {
    if (drafts.length === 0 && removedIds.length === 0) return;
    const existingNames = (rules.data ?? []).map((rule) => rule.name);
    try {
      for (const ruleId of removedIds) {
        await detachEvaluatorFromRule.mutateAsync({
          projectId,
          evaluatorId,
          ruleId,
        });
      }
      for (const draft of drafts) {
        if (draft.isNew) {
          const name = generateEvaluationRuleName({
            filter: draft.filter,
            targetObject: "event",
            existingNames,
          });
          await createRule.mutateAsync({
            projectId,
            name,
            targetObject: "event",
            filter: draft.filter,
            sampling: draft.sampling,
            enabled: true,
            evaluatorIds: [evaluatorId],
          });
          existingNames.push(name);
        } else {
          await updateRule.mutateAsync({
            projectId,
            ruleId: draft.id,
            name: draft.name,
            filter: draft.filter,
            sampling: draft.sampling,
          });
        }
      }
    } catch {
      finishRuleSaveChoice(false);
      return;
    }
    await invalidateRules().catch(() => undefined);
    const changeCount = drafts.length + removedIds.length;
    showSuccessToast({
      title:
        changeCount === 1 ? "Evaluation rule saved" : "Evaluation rules saved",
      description:
        changeCount === 1
          ? "The evaluator rule configuration was updated."
          : `${changeCount} evaluator rule configurations were updated.`,
    });
    finishRuleSaveChoice(true);
  };

  const recordRuleDraft = (
    ruleId: string,
    draft: { filter: FilterState; sampling: number },
  ) => {
    setRuleEdits((current) => ({ ...current, [ruleId]: draft }));
  };

  const selectRuleTab = (
    ruleId: string,
    currentDraft: { filter: FilterState; sampling: number },
  ) => {
    recordRuleDraft(selectedRule.id, currentDraft);
    setSelectedRuleId(ruleId);
    return ruleTabs.find((rule) => rule.id === ruleId);
  };

  const addRuleTab = (currentDraft: {
    filter: FilterState;
    sampling: number;
  }) => {
    recordRuleDraft(selectedRule.id, currentDraft);
    const nextNumber = nextNewRuleNumberRef.current++;
    const newRule: RuleDraft = {
      id: `new-rule-${nextNumber}`,
      name: nextNumber === 1 ? "New rule" : `New rule ${nextNumber}`,
      filter: [...EVALUATION_OBSERVATION_EXCLUSION_FILTERS],
      sampling: 1,
      evaluatorCount: 0,
      isNew: true,
    };
    setNewRules((current) => [...current, newRule]);
    setSelectedRuleId(newRule.id);
    return newRule;
  };

  const removeRuleTab = (
    ruleId: string,
    currentDraft: { filter: FilterState; sampling: number },
  ) => {
    recordRuleDraft(selectedRule.id, currentDraft);
    const removedIndex = ruleTabs.findIndex((rule) => rule.id === ruleId);
    const rule = ruleTabs[removedIndex];
    if (!rule || ruleTabs.length <= 1) return;

    if (rule.isNew) {
      setNewRules((current) =>
        current.filter((candidate) => candidate.id !== ruleId),
      );
    } else {
      setRemovedRuleIds((current) => [...current, ruleId]);
    }
    setRuleEdits((current) => {
      const next = { ...current };
      delete next[ruleId];
      return next;
    });

    if (ruleId !== selectedRule.id) return;
    const remainingRules = ruleTabs.filter(
      (candidate) => candidate.id !== ruleId,
    );
    const nextRule =
      remainingRules[Math.min(removedIndex, remainingRules.length - 1)];
    setSelectedRuleId(nextRule.id);
    return nextRule;
  };

  const updatePendingRuleSampling = (ruleId: string, sampling: number) => {
    const rule = pendingRuleDrafts.find((draft) => draft.id === ruleId);
    if (!rule) return;
    setPendingRuleDrafts((current) =>
      current.map((draft) =>
        draft.id === ruleId ? { ...draft, sampling } : draft,
      ),
    );
  };

  return (
    <>
      <EvaluatorSetupForm
        projectId={projectId}
        sourceTemplate={sourceTemplate}
        initialEvaluatorType={sourceTemplate.type === "CODE" ? "code" : "llm"}
        scoreName={draftScoreName}
        description={draftDescription}
        onScoreNameChange={setDraftScoreName}
        onDescriptionChange={setDraftDescription}
        mode="edit"
        evaluatorId={evaluatorId}
        initialMapping={initialMapping}
        initialFilterState={selectedRule.filter}
        initialSampling={selectedRule.sampling}
        attachedRuleIds={attachedRuleIds.filter(
          (ruleId) => !removedRuleIds.includes(ruleId),
        )}
        ruleTabs={ruleTabs}
        activeRuleTabId={selectedRule.id}
        hasRuleChanges={hasRuleChanges}
        onRuleDraftChange={(draft) => recordRuleDraft(selectedRule.id, draft)}
        onRuleTabChange={selectRuleTab}
        onAddRule={addRuleTab}
        onRemoveRule={removeRuleTab}
        onBeforeSave={(controls) => {
          const modalRuleDrafts = ruleTabs.map((rule) =>
            rule.id === selectedRule.id
              ? {
                  ...rule,
                  filter: controls.filterState,
                  sampling: controls.sampling,
                }
              : rule,
          );
          const draftsToSave = modalRuleDrafts.filter((draft) =>
            ruleConfigChanged(
              draft,
              allAttachedRules.find((rule) => rule.id === draft.id),
            ),
          );
          if (draftsToSave.length === 0 && removedRuleIds.length === 0) {
            return Promise.resolve(true);
          }
          recordRuleDraft(selectedRule.id, {
            filter: controls.filterState,
            sampling: controls.sampling,
          });
          setPendingRuleDrafts(modalRuleDrafts);
          setPendingRemovedRuleIds(removedRuleIds);
          setPendingTestRunCostUsd(controls.estimatedCostUsd);
          setPendingSaveChoice("activation");
          return new Promise<boolean>((resolve) => {
            pendingSaveResolver.current = resolve;
          });
        }}
        onSaved={onSaved}
        onCancel={onCancel}
      />

      {pendingRuleDrafts[0] || pendingRemovedRuleIds[0] ? (
        <CreateEvaluatorActivationDialog
          projectId={projectId}
          evaluatorId={evaluatorId}
          setupFilter={pendingRuleDrafts[0]?.filter ?? selectedRule.filter}
          setupSampling={
            pendingRuleDrafts[0]?.sampling ?? selectedRule.sampling
          }
          testRunCostUsd={pendingTestRunCostUsd}
          isCodeEvaluator={sourceTemplate.type === "CODE"}
          rulePreviews={pendingRuleDrafts}
          sharedRuleCount={
            pendingRuleDrafts.filter(
              (rule) =>
                !rule.isNew &&
                rule.evaluatorCount > 1 &&
                ruleConfigChanged(
                  rule,
                  allAttachedRules.find(
                    (attachedRule) => attachedRule.id === rule.id,
                  ),
                ),
            ).length
          }
          open={pendingSaveChoice === "activation"}
          loading={ruleSavePending}
          onOpenChange={(open) => {
            if (!open && !ruleSavePending) finishRuleSaveChoice(false);
          }}
          onSave={(runContinuously) => {
            if (!runContinuously) {
              finishRuleSaveChoice(true);
              return;
            }
            persistRuleChanges({
              drafts: pendingRuleDrafts.filter((draft) =>
                ruleConfigChanged(
                  draft,
                  allAttachedRules.find((rule) => rule.id === draft.id),
                ),
              ),
              removedIds: pendingRemovedRuleIds,
            }).catch(() => undefined);
          }}
          onRuleSamplingChange={updatePendingRuleSampling}
        />
      ) : null}
    </>
  );
}
