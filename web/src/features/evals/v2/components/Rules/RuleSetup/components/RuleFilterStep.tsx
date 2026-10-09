import { useState } from "react";
import { useStore } from "zustand";
import { EvalTargetObject } from "@langfuse/shared";

import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { RuleSampleObservationSelector } from "@/src/features/evals/v2/components/Evaluators/Testing/components/RuleSampleObservationSelector/RuleSampleObservationSelector";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";
import { RULE_SAMPLE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import {
  SearchBarDraftCacheContext,
  useSearchBarDraftCache,
} from "@/src/features/search-bar";
import { env } from "@/src/env.mjs";
import { api } from "@/src/utils/api";
import { RuleSamplingSection } from "./RuleSamplingSection";
import { RuleEvaluatorResultTriggerSection } from "./RuleEvaluatorResultTriggerSection";
import { RuleTriggerTypeSelector } from "./RuleTriggerTypeSelector";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export function RuleFilterStep({
  projectId,
  store,
}: {
  projectId: string;
  store: RuleSetupStore;
}) {
  const filter = useStore(store, (state) => state.filter);
  const targetObject = useStore(store, (state) => state.targetObject);
  const scoreResultTrigger = useStore(
    store,
    (state) => state.scoreResultTrigger,
  );
  const previewSourceRuleId = useStore(
    store,
    (state) => state.previewSourceRuleId,
  );
  const storedPreviewFilter = useStore(store, (state) => state.previewFilter);
  const selectedObservationId = useStore(
    store,
    (state) => state.selectedObservation?.id ?? null,
  );
  const observationSearchDraft = useSearchBarDraftCache("observation");
  const actions = store.getState().actions;
  const attachedRules = api.evalsV2.rules.listRulesForEvaluator.useQuery(
    {
      projectId,
      evaluatorId: scoreResultTrigger?.evaluatorId ?? "",
    },
    { enabled: scoreResultTrigger !== null },
  );
  const sourceRules = (attachedRules.data ?? []).filter(
    ({ evaluationRule }) =>
      evaluationRule.targetObject !== EvalTargetObject.SCORE_RESULT,
  );
  const selectedSourceRule =
    sourceRules.find(
      ({ evaluationRule }) => evaluationRule.id === previewSourceRuleId,
    ) ?? sourceRules[0];
  const effectivePreviewFilter =
    selectedSourceRule &&
    selectedSourceRule.evaluationRule.id !== previewSourceRuleId
      ? selectedSourceRule.evaluationRule.filter
      : storedPreviewFilter;
  const previewSearchDraft = useSearchBarDraftCache(
    selectedSourceRule?.evaluationRule.id ?? "incoming",
  );
  const [timeRange] = useState(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - SEVEN_DAYS_MS), to };
  });
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
    const selected = sourceRules.find(
      ({ evaluationRule }) => evaluationRule.id === ruleId,
    );
    if (!selected) return;
    actions.setPreviewSourceRuleId(ruleId);
    actions.setPreviewFilter(selected.evaluationRule.filter);
  };
  const handlePreviewFilterChange = (
    filterState: typeof storedPreviewFilter,
  ) => {
    if (selectedSourceRule) {
      actions.setPreviewSourceRuleId(selectedSourceRule.evaluationRule.id);
    }
    actions.setPreviewFilter(filterState);
  };
  const scopeFields =
    targetObject !== EvalTargetObject.SCORE_RESULT ? (
      <>
        <SearchBarDraftCacheContext.Provider value={observationSearchDraft}>
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
        </SearchBarDraftCacheContext.Provider>
        <RuleSamplingSection store={store} />
      </>
    ) : (
      <>
        <RuleEvaluatorResultTriggerSection
          projectId={projectId}
          store={store}
        />
        {scoreResultTrigger && !attachedRules.isPending ? (
          <div className="flex flex-col gap-2">
            {sourceRules.length > 1 && selectedSourceRule ? (
              <>
                <label className="text-sm" htmlFor="preview-rule">
                  Preview observation source
                </label>
                <SelectInput
                  id="preview-rule"
                  value={selectedSourceRule.evaluationRule.id}
                  options={sourceRules.map(({ evaluationRule }) => ({
                    value: evaluationRule.id,
                    label: evaluationRule.name,
                  }))}
                  onValueChange={handlePreviewRuleChange}
                  placeholder="Select a source rule"
                />
                <p className="text-muted-foreground text-xs">
                  Matching observations use the selected attached rule’s
                  filters.
                </p>
              </>
            ) : null}
            <SearchBarDraftCacheContext.Provider value={previewSearchDraft}>
              <RuleSampleObservationSelector
                projectId={projectId}
                timeRange={timeRange}
                filterState={effectivePreviewFilter}
                onFilterStateChange={handlePreviewFilterChange}
                tableName="evaluation-result-rule-preview"
                registry={RULE_SAMPLE_FIELD_REGISTRY}
                selectedObservationId={selectedObservationId}
                onSelect={actions.setSelectedObservation}
                onOpenTrace={handleOpenTrace}
              />
            </SearchBarDraftCacheContext.Provider>
          </div>
        ) : null}
      </>
    );

  return (
    <Stepper
      number={1}
      title="Configure rule scope"
      description="Choose the trigger, then filter which events are evaluated."
    >
      <RuleTriggerTypeSelector
        value={targetObject}
        onValueChange={actions.setTargetObject}
      />
      {scopeFields}
    </Stepper>
  );
}
