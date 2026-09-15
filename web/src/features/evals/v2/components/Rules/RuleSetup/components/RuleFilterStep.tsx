import { useState } from "react";
import { useStore } from "zustand";

import { RuleSampleObservationSelector } from "@/src/features/evals/v2/components/Evaluators/Testing/components/RuleSampleObservationSelector/RuleSampleObservationSelector";
import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";
import { RULE_SAMPLE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import { env } from "@/src/env.mjs";
import { RuleSamplingSection } from "./RuleSamplingSection";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export function RuleFilterStep({
  projectId,
  store,
}: {
  projectId: string;
  store: RuleSetupStore;
}) {
  const filter = useStore(store, (state) => state.filter);
  const selectedObservationId = useStore(
    store,
    (state) => state.selectedObservation?.id ?? null,
  );
  const [timeRange] = useState(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - SEVEN_DAYS_MS), to };
  });
  const actions = store.getState().actions;
  return (
    <Stepper
      number={1}
      title="Configure rule scope"
      description="Set filters and a sampling rate to control which incoming observations are evaluated."
    >
      <RuleSampleObservationSelector
        projectId={projectId}
        timeRange={timeRange}
        filterState={filter}
        onFilterStateChange={actions.setFilter}
        tableName="evaluation-rule-matching-observations"
        registry={RULE_SAMPLE_FIELD_REGISTRY}
        selectedObservationId={selectedObservationId}
        onSelect={actions.setSelectedObservation}
        onOpenTrace={(observation) => {
          if (!observation.traceId) return;
          const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";
          window.open(
            `${basePath}/project/${projectId}/traces/${observation.traceId}?observation=${observation.id}`,
            "_blank",
            "noopener,noreferrer",
          );
        }}
      />
      <RuleSamplingSection store={store} />
    </Stepper>
  );
}
