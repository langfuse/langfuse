import { useState } from "react";
import { useStore } from "zustand";
import { Activity, Gauge } from "lucide-react";

import { RadioGroup } from "@/src/components/design-system/RadioGroup/RadioGroup";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { RuleSampleObservationSelector } from "@/src/features/evals/v2/components/Evaluators/Testing/components/RuleSampleObservationSelector/RuleSampleObservationSelector";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";
import { RULE_SAMPLE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import { env } from "@/src/env.mjs";
import { api } from "@/src/utils/api";
import { RuleSamplingSection } from "./RuleSamplingSection";
import { RuleEvaluatorResultTriggerSection } from "./RuleEvaluatorResultTriggerSection";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export function RuleFilterStep({
  projectId,
  store,
}: {
  projectId: string;
  store: RuleSetupStore;
}) {
  const filter = useStore(store, (state) => state.filter);
  const triggerKind = useStore(store, (state) => state.triggerKind);
  const scoreResultTrigger = useStore(
    store,
    (state) => state.scoreResultTrigger,
  );
  const previewSourceRuleId = useStore(
    store,
    (state) => state.previewSourceRuleId,
  );
  const previewFilter = useStore(store, (state) => state.previewFilter);
  const selectedObservationId = useStore(
    store,
    (state) => state.selectedObservation?.id ?? null,
  );
  const [timeRange] = useState(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - SEVEN_DAYS_MS), to };
  });
  const actions = store.getState().actions;
  const { sourceRules, previewRuleOptions } = useSourceRulePreview({
    projectId,
    evaluatorId: scoreResultTrigger?.evaluatorId ?? null,
  });
  const handleTriggerKindChange = (value: string) => {
    actions.setTriggerKind(value as "OBSERVATION" | "SCORE_RESULT");
  };
  const handleOpenTrace = (observation: SampleObservation) => {
    if (!observation.traceId) return;
    const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";
    window.open(
      `${basePath}/project/${projectId}/traces/${observation.traceId}?observation=${observation.id}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  const handlePreviewRuleChange = (ruleId: string) => {
    if (ruleId === "incoming") {
      actions.setPreviewSourceRuleId(null);
      actions.setPreviewFilter([]);
      return;
    }
    const selected = sourceRules.find(
      ({ evaluationRule }) => evaluationRule.id === ruleId,
    );
    actions.setPreviewSourceRuleId(ruleId);
    actions.setPreviewFilter(selected?.evaluationRule.filter ?? []);
  };
  const scopeFields =
    triggerKind === "OBSERVATION" ? (
      <>
        <RuleSampleObservationSelector
          projectId={projectId}
          timeRange={timeRange}
          filterState={filter}
          onFilterStateChange={actions.setFilter}
          tableName="evaluation-rule-matching-observations"
          registry={RULE_SAMPLE_FIELD_REGISTRY}
          selectedObservationId={selectedObservationId}
          onSelect={actions.setSelectedObservation}
          onOpenTrace={handleOpenTrace}
        />
        <RuleSamplingSection store={store} />
      </>
    ) : (
      <>
        <RuleEvaluatorResultTriggerSection
          projectId={projectId}
          store={store}
        />
        {scoreResultTrigger && (
          <div className="flex flex-col gap-2">
            <label className="text-sm" htmlFor="preview-rule">
              Preview observation source
            </label>
            <SelectInput
              id="preview-rule"
              value={previewSourceRuleId ?? "incoming"}
              options={previewRuleOptions}
              onValueChange={handlePreviewRuleChange}
              placeholder="Select a source rule"
            />
            <p className="text-muted-foreground text-xs">
              This selection only changes the preview. It does not restrict
              which evaluator executions trigger the rule.
            </p>
            <RuleSampleObservationSelector
              projectId={projectId}
              timeRange={timeRange}
              filterState={previewFilter}
              onFilterStateChange={actions.setPreviewFilter}
              tableName="evaluation-result-rule-preview"
              registry={RULE_SAMPLE_FIELD_REGISTRY}
              selectedObservationId={selectedObservationId}
              onSelect={actions.setSelectedObservation}
              onOpenTrace={handleOpenTrace}
            />
          </div>
        )}
      </>
    );

  return (
    <Stepper
      number={1}
      title="Configure rule scope"
      description="Choose what should trigger attached evaluators."
    >
      <RadioGroup value={triggerKind} onValueChange={handleTriggerKindChange}>
        <label
          className="border-border flex cursor-pointer items-start gap-3 rounded-md border p-3"
          htmlFor="rule-trigger-observation"
        >
          <RadioGroup.Item id="rule-trigger-observation" value="OBSERVATION" />
          <Activity className="icon-base text-icon-foreground mt-0.5" />
          <span>
            <span className="block text-sm">Incoming observations</span>
            <span className="text-muted-foreground block text-sm">
              Run when a new observation matches the filters.
            </span>
          </span>
        </label>
        <label
          className="border-border flex cursor-pointer items-start gap-3 rounded-md border p-3"
          htmlFor="rule-trigger-score-result"
        >
          <RadioGroup.Item
            id="rule-trigger-score-result"
            value="SCORE_RESULT"
          />
          <Gauge className="icon-base text-icon-foreground mt-0.5" />
          <span>
            <span className="block text-sm">Evaluator results</span>
            <span className="text-muted-foreground block text-sm">
              Run after an evaluator returns matching scores.
            </span>
          </span>
        </label>
      </RadioGroup>
      {scopeFields}
    </Stepper>
  );
}

function useSourceRulePreview({
  projectId,
  evaluatorId,
}: {
  projectId: string;
  evaluatorId: string | null;
}) {
  const query = api.evalsV2.rules.listRulesForEvaluator.useQuery(
    {
      projectId,
      evaluatorId: evaluatorId ?? "",
    },
    { enabled: evaluatorId !== null },
  );
  const sourceRules = query.data ?? [];
  const previewRuleOptions = [
    { value: "incoming", label: "All incoming observations" },
    ...sourceRules
      .filter(
        ({ evaluationRule }) => evaluationRule.triggerKind === "OBSERVATION",
      )
      .map(({ evaluationRule }) => ({
        value: evaluationRule.id,
        label: evaluationRule.name,
      })),
  ];

  return { sourceRules, previewRuleOptions };
}
