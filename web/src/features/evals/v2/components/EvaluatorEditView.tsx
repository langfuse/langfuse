import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronsUpDown, Trash2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  EvaluatorSetupForm,
  type CatalogTemplate,
  type EvaluatorSetupRuleControls,
} from "@/src/features/evals/v2/components/EvaluatorSetupForm";
import {
  ConfirmEvaluationRuleAttachmentDialog,
  ConfirmEvaluationRuleDetachmentDialog,
} from "@/src/features/evals/v2/components/EvaluatorEditRuleDialogs";
import { CreateEvaluationRuleDialog } from "@/src/features/evals/v2/components/CreateEvaluationRuleDialog";
import { EvaluationRulePicker } from "@/src/features/evals/v2/components/EvaluationRulePicker";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { type ObservationVariableMapping } from "@langfuse/shared";

type EvaluationRule = {
  id: string;
  name: string;
  filter: EvaluatorSetupRuleControls["filterState"];
  sampling: number;
};

type RuleControlsProps = EvaluatorSetupRuleControls & {
  attachedRuleIds: string[];
  selectedRuleId: string | null;
  rules: EvaluationRule[];
  onSelectRule: (rule: EvaluationRule) => void;
  onRequestAttach: (rule: EvaluationRule) => void;
  onCreateRule: () => void;
  onSelectOverview: () => void;
};

function FilterSourcePicker({
  attachedRuleIds,
  selectedRuleId,
  rules,
  setFilterState,
  setSampling,
  onSelectRule,
  onRequestAttach,
  onCreateRule,
  onSelectOverview,
}: RuleControlsProps) {
  const attachedRules = rules.filter((rule) =>
    attachedRuleIds.includes(rule.id),
  );
  const availableRules = rules.filter(
    (rule) => !attachedRuleIds.includes(rule.id),
  );
  const selectedRuleLabel =
    rules.find((rule) => rule.id === selectedRuleId)?.name ?? null;
  const attachedRuleCountLabel = `${attachedRuleIds.length} rule${attachedRuleIds.length === 1 ? "" : "s"}`;

  const selectRule = (rule: EvaluationRule) => {
    setFilterState(rule.filter);
    setSampling(rule.sampling);
    onSelectRule(rule);
  };

  const selectOverview = () => {
    setFilterState([]);
    setSampling(1);
    onSelectOverview();
  };

  return (
    <EvaluationRulePicker
      trigger={(open) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-label="Select evaluation rule"
          aria-expanded={open}
          className="h-8 w-fit max-w-full min-w-0 justify-between font-normal"
          title={selectedRuleLabel ?? attachedRuleCountLabel}
        >
          <span className="flex min-w-0 items-center">
            {selectedRuleLabel ? (
              <span className="max-w-64 truncate" title={selectedRuleLabel}>
                {selectedRuleLabel}
              </span>
            ) : (
              <>
                <span className="whitespace-nowrap">Rules</span>
                <span className="bg-muted ml-2 rounded-sm px-1.5 py-0.5 text-xs tabular-nums">
                  {attachedRuleIds.length}
                </span>
              </>
            )}
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </span>
        </Button>
      )}
      attachedRules={attachedRules}
      availableRules={availableRules}
      selectedRuleId={selectedRuleId}
      onSelectAttachedRule={selectRule}
      onSelectAvailableRule={onRequestAttach}
      onCreateRule={onCreateRule}
      onClearSelection={selectedRuleLabel ? selectOverview : undefined}
    />
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
  ruleControlsContainer,
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
  ruleControlsContainer?: HTMLElement | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const utils = api.useUtils();
  const rules = api.evalsV2.rules.useQuery({ projectId });
  const attachRule = api.evalsV2.attachEvaluatorToRule.useMutation({
    onError: (error) => trpcErrorToast(error),
  });
  const detachRule = api.evalsV2.detachEvaluatorFromRule.useMutation({
    onError: (error) => trpcErrorToast(error),
  });
  const initialRuleIsAttached = initialEvaluationRuleId
    ? attachedRuleIds.includes(initialEvaluationRuleId)
    : false;
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(
    initialRuleIsAttached ? (initialEvaluationRuleId ?? null) : null,
  );
  const [currentAttachedRuleIds, setCurrentAttachedRuleIds] =
    useState(attachedRuleIds);
  const [ruleToAttachId, setRuleToAttachId] = useState<string | null>(
    initialEvaluationRuleId && !initialRuleIsAttached
      ? initialEvaluationRuleId
      : null,
  );
  const [ruleToDetach, setRuleToDetach] = useState<EvaluationRule | null>(null);
  const [createRuleDialogOpen, setCreateRuleDialogOpen] = useState(false);

  if (rules.isPending) {
    return <Skeleton className="m-6 h-96 w-auto" />;
  }

  const compatibleRules = (rules.data ?? []).filter(
    (rule) => rule.targetObject === "event",
  );
  const selectedRule = compatibleRules.find(
    (rule) => rule.id === selectedRuleId,
  );
  const ruleToAttach = compatibleRules.find(
    (rule) => rule.id === ruleToAttachId,
  );

  const handleSelectRuleOverview = () => {
    setSelectedRuleId(null);
  };

  return (
    <>
      <EvaluatorSetupForm
        projectId={projectId}
        sourceTemplate={sourceTemplate}
        initialEvaluatorType={sourceTemplate.type === "CODE" ? "code" : "llm"}
        scoreName={scoreName}
        description={description}
        mode="edit"
        evaluatorId={evaluatorId}
        initialMapping={initialMapping}
        initialFilterState={selectedRule?.filter ?? []}
        initialSampling={selectedRule?.sampling ?? 1}
        filterEditingDisabled={selectedRuleId !== null}
        activeFilterSourceLabel={selectedRule?.name}
        ruleEditorExpanded={!createRuleDialogOpen}
        renderRuleControls={(controls) =>
          ruleControlsContainer
            ? createPortal(
                <>
                  <FilterSourcePicker
                    {...controls}
                    attachedRuleIds={currentAttachedRuleIds}
                    selectedRuleId={selectedRuleId}
                    rules={compatibleRules}
                    onSelectRule={(rule) => {
                      setSelectedRuleId(rule.id);
                    }}
                    onRequestAttach={(rule) => setRuleToAttachId(rule.id)}
                    onCreateRule={() => setCreateRuleDialogOpen(true)}
                    onSelectOverview={handleSelectRuleOverview}
                  />
                  <ConfirmEvaluationRuleAttachmentDialog
                    projectId={projectId}
                    evaluatorId={evaluatorId}
                    rule={ruleToAttach ?? null}
                    isCodeEvaluator={sourceTemplate.type === "CODE"}
                    open={ruleToAttach !== undefined}
                    onOpenChange={(open) => {
                      if (!open) setRuleToAttachId(null);
                    }}
                    loading={attachRule.isPending}
                    onConfirm={async () => {
                      if (!ruleToAttach) return;
                      try {
                        await attachRule.mutateAsync({
                          projectId,
                          evaluatorId,
                          ruleId: ruleToAttach.id,
                        });
                      } catch {
                        return;
                      }
                      controls.setFilterState(ruleToAttach.filter);
                      controls.setSampling(ruleToAttach.sampling);
                      setSelectedRuleId(ruleToAttach.id);
                      setCurrentAttachedRuleIds((current) =>
                        current.includes(ruleToAttach.id)
                          ? current
                          : [...current, ruleToAttach.id],
                      );
                      setRuleToAttachId(null);
                      await Promise.all([
                        utils.evals.invalidate(),
                        utils.evalsV2.invalidate(),
                      ]).catch(() => undefined);
                    }}
                  />
                </>,
                ruleControlsContainer,
              )
            : null
        }
        renderFilterActions={({ setFilterState, setSampling }) =>
          selectedRuleId ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0"
                aria-label="Detach evaluator from rule"
                title="Detach evaluator from rule"
                onClick={() => setRuleToDetach(selectedRule ?? null)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <ConfirmEvaluationRuleDetachmentDialog
                rule={ruleToDetach}
                isOnlyAttachedRule={currentAttachedRuleIds.length === 1}
                open={ruleToDetach !== null}
                onOpenChange={(open) => {
                  if (!open) setRuleToDetach(null);
                }}
                loading={detachRule.isPending}
                onConfirm={async () => {
                  if (!ruleToDetach) return;
                  try {
                    await detachRule.mutateAsync({
                      projectId,
                      evaluatorId,
                      ruleId: ruleToDetach.id,
                    });
                  } catch {
                    return;
                  }
                  setCurrentAttachedRuleIds((current) =>
                    current.filter((id) => id !== ruleToDetach.id),
                  );
                  setSelectedRuleId(null);
                  setFilterState([]);
                  setSampling(1);
                  setRuleToDetach(null);
                  await Promise.all([
                    utils.evals.invalidate(),
                    utils.evalsV2.invalidate(),
                  ]).catch(() => undefined);
                }}
              />
            </>
          ) : null
        }
        onSaved={onSaved}
        onCancel={onCancel}
      />

      {createRuleDialogOpen ? (
        <CreateEvaluationRuleDialog
          projectId={projectId}
          open
          onOpenChange={setCreateRuleDialogOpen}
        />
      ) : null}
    </>
  );
}
