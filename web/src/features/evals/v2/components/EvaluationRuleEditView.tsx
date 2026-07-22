import { useState } from "react";

import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Input } from "@/src/components/ui/input";
import { Slider } from "@/src/components/ui/slider";
import { EvaluationRuleFieldLabel } from "@/src/features/evals/v2/components/EvaluationRuleFieldLabel";
import { RuleFilterSearchBar } from "@/src/features/evals/v2/components/EvaluationRuleSection";
import { EvaluationRulePreviewTable } from "@/src/features/evals/v2/components/EvaluationRulePreviewTable";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { type AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { type FilterState } from "@langfuse/shared";

export function EvaluationRuleEditView({
  projectId,
  evaluationRule,
  timeRange,
  onCancel,
  onSaved,
  onOpenTrace,
}: {
  projectId: string;
  evaluationRule: {
    id: string;
    name: string;
    filter: FilterState;
    sampling: number;
    enabled: boolean;
    evaluators: Array<{ id: string; scoreName: string }>;
  };
  timeRange: AbsoluteTimeRange | null;
  onCancel: () => void;
  onSaved: () => void;
  onOpenTrace: (traceId: string) => void;
}) {
  const utils = api.useUtils();
  const [name, setName] = useState(evaluationRule.name);
  const [filterState, setFilterState] = useState(evaluationRule.filter);
  const [sampling, setSampling] = useState(evaluationRule.sampling);
  const [saveConfirmationOpen, setSaveConfirmationOpen] = useState(false);

  const updateRule = api.evalsV2.updateRule.useMutation({
    onError: (error) => trpcErrorToast(error),
  });
  const setEnabled = api.evalsV2.setRulesEnabled.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: async (_data, variables) => {
      showSuccessToast({
        title: variables.enabled ? "Rule enabled" : "Rule disabled",
        description: `“${evaluationRule.name}” was updated.`,
      });
      await Promise.all([utils.evals.invalidate(), utils.evalsV2.invalidate()]);
    },
  });
  const evaluatorCount = evaluationRule.evaluators.length;
  const hasChanges =
    name.trim() !== evaluationRule.name ||
    sampling !== evaluationRule.sampling ||
    JSON.stringify(filterState) !== JSON.stringify(evaluationRule.filter);

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

  return (
    <div className="flex min-w-0 flex-col gap-6 p-4">
      <section className="flex flex-col gap-2">
        <EvaluationRuleFieldLabel
          htmlFor="evaluation-rule-enabled"
          tooltip="Lets attached evaluators run on matching incoming observations."
        >
          Enabled
        </EvaluationRuleFieldLabel>
        <Switch
          id="evaluation-rule-enabled"
          checked={evaluationRule.enabled}
          disabled={setEnabled.isPending}
          onCheckedChange={(enabled) =>
            setEnabled.mutate({
              projectId,
              ruleIds: [evaluationRule.id],
              enabled,
            })
          }
          aria-label={`${evaluationRule.enabled ? "Disable" : "Enable"} ${evaluationRule.name}`}
          color="green"
        />
      </section>

      <div className="flex flex-col gap-2">
        <EvaluationRuleFieldLabel
          htmlFor="evaluation-rule-name"
          tooltip="Use a short, recognizable name for this rule."
        >
          Name
        </EvaluationRuleFieldLabel>
        <Input
          id="evaluation-rule-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <EvaluationRuleFieldLabel tooltip="Only matching observations are evaluated. Add filters to narrow the incoming data included.">
          Filters
        </EvaluationRuleFieldLabel>
        <RuleFilterSearchBar
          projectId={projectId}
          filterState={filterState}
          setFilterState={setFilterState}
        />
      </section>

      <section className="flex flex-col gap-2">
        <EvaluationRuleFieldLabel tooltip="The share of matching observations to evaluate. 100% evaluates every match.">
          Sampling
        </EvaluationRuleFieldLabel>
        <Slider
          min={0.0001}
          max={1}
          step={0.0001}
          value={[sampling]}
          onValueChange={(value) => setSampling(value[0] ?? sampling)}
          showInput
          displayAsPercentage
        />
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <EvaluationRuleFieldLabel tooltip="Preview recent observations that currently match this rule.">
          Matching observations
        </EvaluationRuleFieldLabel>
        <EvaluationRulePreviewTable
          projectId={projectId}
          filterState={filterState}
          timeRange={timeRange}
          onSelectObservation={(row) => {
            if (row.traceId) onOpenTrace(row.traceId);
          }}
        />
      </section>

      <div className="flex items-center justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={updateRule.isPending}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          loading={updateRule.isPending}
          disabled={!name.trim() || !hasChanges}
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
