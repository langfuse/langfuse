import { useRef, useState } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { generateEvaluationRuleName } from "@/src/features/evals/v2/components/EvaluationRuleSection";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  EvaluatorSetupForm,
  type CatalogTemplate,
  type EvaluatorSetupRuleControls,
} from "@/src/features/evals/v2/components/EvaluatorSetupForm";
import { ActivationCostEstimate } from "@/src/features/evals/v2/components/ActivationCostEstimate";
import { CreateEvaluatorActivationDialog } from "@/src/features/evals/v2/components/CreateEvaluatorActivationDialog";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { type ObservationVariableMapping } from "@langfuse/shared";

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
      : (attachedRuleIds[0] ?? null),
  );
  const [editedFilters, setEditedFilters] = useState<
    EvaluatorSetupRuleControls["filterState"] | null
  >(null);
  const [pendingRuleControls, setPendingRuleControls] =
    useState<EvaluatorSetupRuleControls | null>(null);
  const [pendingSaveChoice, setPendingSaveChoice] = useState<
    "activation" | "rule" | null
  >(null);
  const pendingSaveResolver = useRef<
    ((shouldContinue: boolean) => void) | null
  >(null);
  const utils = api.useUtils();
  const rules = api.evalsV2.rules.useQuery({ projectId });
  const updateRule = api.evalsV2.updateRule.useMutation({
    onError: (error) => trpcErrorToast(error),
  });
  const createRule = api.evalsV2.createRule.useMutation({
    onError: (error) => trpcErrorToast(error),
  });

  if (rules.isPending) {
    return <Skeleton className="m-6 h-96 w-auto" />;
  }

  const attachedRules = (rules.data ?? []).filter(
    (rule) =>
      rule.targetObject === "event" && attachedRuleIds.includes(rule.id),
  );
  const initialRule = attachedRules.find((rule) => rule.id === selectedRuleId);
  const filtersEdited = initialRule
    ? editedFilters !== null &&
      JSON.stringify(editedFilters) !== JSON.stringify(initialRule.filter)
    : true;
  // A rule attached to only this evaluator can be updated in place; only a
  // rule shared with other evaluators needs the fork-or-share choice.
  const isRuleShared = (initialRule?.evaluatorCount ?? 0) > 1;
  const ruleSavePending = updateRule.isPending || createRule.isPending;

  const finishRuleSaveChoice = (shouldContinue: boolean) => {
    setPendingRuleControls(null);
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

  const updateExistingRule = async () => {
    if (!initialRule || !pendingRuleControls) return;
    try {
      await updateRule.mutateAsync({
        projectId,
        ruleId: initialRule.id,
        name: initialRule.name,
        filter: pendingRuleControls.filterState,
        sampling: initialRule.sampling,
      });
    } catch {
      return;
    }
    await invalidateRules().catch(() => undefined);
    setEditedFilters(null);
    showSuccessToast({
      title: "Rule filters updated",
      description: `The updated filters now apply to every evaluator using “${initialRule.name}”.`,
    });
    finishRuleSaveChoice(true);
  };

  // Only called for evaluators with no rule attached yet; a rule attached to
  // only this evaluator is updated in place instead (see updateExistingRule).
  const createNewRule = async (
    controls: EvaluatorSetupRuleControls,
  ): Promise<boolean> => {
    const name = generateEvaluationRuleName({
      filter: controls.filterState,
      targetObject: "event",
      existingNames: (rules.data ?? []).map((rule) => rule.name),
    });
    try {
      await createRule.mutateAsync({
        projectId,
        name,
        targetObject: "event",
        filter: controls.filterState,
        sampling: controls.sampling,
        enabled: true,
        evaluatorIds: [evaluatorId],
      });
    } catch {
      return false;
    }
    await invalidateRules().catch(() => undefined);
    setEditedFilters(null);
    showSuccessToast({
      title: "New rule created",
      description: `This evaluator now uses “${name}”.`,
    });
    return true;
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
        initialFilterState={initialRule?.filter}
        initialSampling={initialRule?.sampling ?? 1}
        attachedRuleIds={attachedRuleIds}
        samplingEditingDisabled={Boolean(initialRule)}
        hasRuleChanges={filtersEdited}
        onFiltersEdited={setEditedFilters}
        onBeforeSave={(controls) => {
          if (!filtersEdited) return Promise.resolve(true);
          setPendingRuleControls(controls);
          setPendingSaveChoice(isRuleShared ? "rule" : "activation");
          return new Promise<boolean>((resolve) => {
            pendingSaveResolver.current = resolve;
          });
        }}
        renderDataSourceControls={({ applyRule }) =>
          attachedRules.length > 0 ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="shrink-0 text-sm">using rule</span>
              <Label htmlFor="edit-evaluator-rule" className="sr-only">
                Evaluation rule
              </Label>
              <Select
                value={selectedRuleId ?? undefined}
                onValueChange={(value) => {
                  const rule = attachedRules.find(
                    (candidate) => candidate.id === value,
                  );
                  if (!rule) return;
                  setEditedFilters(null);
                  setSelectedRuleId(rule.id);
                  applyRule(rule);
                }}
              >
                <SelectTrigger
                  id="edit-evaluator-rule"
                  className="min-w-0 flex-1 text-left [&>span]:text-left"
                >
                  <SelectValue placeholder="Select an attached rule" />
                </SelectTrigger>
                <SelectContent>
                  {attachedRules.map((rule) => (
                    <SelectItem key={rule.id} value={rule.id}>
                      {rule.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null
        }
        onSaved={onSaved}
        onCancel={onCancel}
      />

      <Dialog
        open={pendingSaveChoice === "rule"}
        onOpenChange={(open) => {
          if (!open && !ruleSavePending) finishRuleSaveChoice(false);
        }}
      >
        <DialogContent className="sm:max-w-xl" closeOnInteractionOutside>
          <DialogHeader variant="action">
            <DialogTitle>Save filter changes?</DialogTitle>
          </DialogHeader>

          <DialogBody className="gap-4">
            <DialogDescription>
              You changed the filters, but “{initialRule?.name}” is shared with
              other evaluators — updating it here changes what they run on too.
            </DialogDescription>

            {pendingRuleControls ? (
              <ActivationCostEstimate
                projectId={projectId}
                filter={pendingRuleControls.filterState}
                sampling={pendingRuleControls.sampling}
                testRunCostUsd={null}
                isCodeEvaluator={sourceTemplate.type === "CODE"}
                enabled={pendingSaveChoice === "rule"}
              />
            ) : null}
          </DialogBody>

          <DialogFooter variant="action">
            <Button
              type="button"
              variant="outline"
              disabled={ruleSavePending}
              onClick={() => finishRuleSaveChoice(true)}
            >
              Save evaluator only
            </Button>
            <Button
              type="button"
              loading={updateRule.isPending}
              disabled={ruleSavePending}
              onClick={() => updateExistingRule().catch(() => undefined)}
            >
              Update rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingRuleControls ? (
        <CreateEvaluatorActivationDialog
          projectId={projectId}
          setupFilter={pendingRuleControls.filterState}
          setupSampling={pendingRuleControls.sampling}
          testRunCostUsd={null}
          isCodeEvaluator={sourceTemplate.type === "CODE"}
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
            if (initialRule) {
              updateExistingRule().catch(() => undefined);
              return;
            }
            createNewRule(pendingRuleControls)
              .then((created) => {
                if (created) finishRuleSaveChoice(true);
              })
              .catch(() => undefined);
          }}
        />
      ) : null}
    </>
  );
}
