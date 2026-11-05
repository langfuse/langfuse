import { useId, useState } from "react";
import { useStore } from "zustand";

import { Radio } from "@/src/components/design-system/Radio/Radio";
import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";
import { RuleSampleObservationSelector } from "@/src/features/evals/v2/components/Evaluators/Testing/components/RuleSampleObservationSelector/RuleSampleObservationSelector";
import { TraceRuleIdleTime } from "@/src/features/evals/v2/components/Rules/CreateRuleDialog/components/TraceRuleIdleTime/TraceRuleIdleTime";
import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";
import { RULE_SAMPLE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import { env } from "@/src/env.mjs";
import { RuleSamplingSection } from "./RuleSamplingSection";

export type RuleScope = "observation" | "trace";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export function RuleFilterStep({
  projectId,
  store,
  scope,
  onScopeChange,
}: {
  projectId: string;
  store: RuleSetupStore;
  scope: RuleScope;
  onScopeChange?: (scope: RuleScope) => void;
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
  const scopeGroupName = useId();
  const actions = store.getState().actions;
  const traceTranscript = scope === "trace";
  return (
    <Stepper
      number={1}
      title="Configure rule scope"
      description={
        traceTranscript
          ? "Set filters and a sampling rate to control which traces are evaluated."
          : "Set filters and a sampling rate to control which incoming observations are evaluated."
      }
    >
      <div
        role="radiogroup"
        aria-label="Scope"
        className="flex items-center gap-4"
      >
        <label className="flex items-center gap-2 text-sm">
          <Radio
            name={scopeGroupName}
            value="observation"
            checked={scope === "observation"}
            onChange={() => onScopeChange?.("observation")}
          />
          Observation
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Radio
            name={scopeGroupName}
            value="trace"
            checked={scope === "trace"}
            onChange={() => onScopeChange?.("trace")}
          />
          Trace
        </label>
      </div>
      {traceTranscript ? (
        <section className="flex flex-col gap-2">
          <SectionHeader
            title="Idle time"
            meta={null}
            description={null}
            tooltip="A trace is evaluated once no new events arrive for this long. This is the project idle time Topics stores."
            trailing={null}
          />
          <TraceRuleIdleTime projectId={projectId} />
        </section>
      ) : null}
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
