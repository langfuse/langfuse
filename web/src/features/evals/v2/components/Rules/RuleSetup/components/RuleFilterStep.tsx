import { useId, useState } from "react";
import { useStore } from "zustand";

import { Radio } from "@/src/components/design-system/Radio/Radio";
import { RuleSampleObservationSelector } from "@/src/features/evals/v2/components/Evaluators/Testing/components/RuleSampleObservationSelector/RuleSampleObservationSelector";
import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";
import {
  RULE_SAMPLE_FIELD_REGISTRY,
  TRACE_TRANSCRIPT_SAMPLE_FIELD_REGISTRY,
} from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import { env } from "@/src/env.mjs";
import { TraceRuleIdleTime } from "@/src/features/evals/v2/components/Rules/RuleSetup/components/TraceRuleIdleTime/TraceRuleIdleTime";
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
  const scope = useStore(store, (state) => state.scope);
  const scopeControl = useStore(store, (state) => state.scopeControl);
  const [timeRange] = useState(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - SEVEN_DAYS_MS), to };
  });
  const scopeGroupName = useId();
  const actions = store.getState().actions;
  const traceTranscript = scope === "trace";
  const scopeLocked = scopeControl === "locked";
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
      {scopeControl !== "hidden" && (
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
              disabled={scopeLocked}
              onChange={() => actions.setScope("observation")}
            />
            Observation
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Radio
              name={scopeGroupName}
              value="trace"
              checked={scope === "trace"}
              disabled={scopeLocked}
              onChange={() => actions.setScope("trace")}
            />
            Trace
          </label>
          {scopeLocked ? (
            <span className="text-muted-foreground text-xs">
              Scope is fixed after creation.
            </span>
          ) : null}
        </div>
      )}
      <RuleSampleObservationSelector
        projectId={projectId}
        timeRange={timeRange}
        filterState={filter}
        onFilterStateChange={actions.setFilter}
        tableName="evaluation-rule-matching-observations"
        registry={
          traceTranscript
            ? TRACE_TRANSCRIPT_SAMPLE_FIELD_REGISTRY
            : RULE_SAMPLE_FIELD_REGISTRY
        }
        selectedObservationId={selectedObservationId}
        onSelect={actions.setSelectedObservation}
        sampleScope={scope}
        showMatches={!traceTranscript}
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
      {traceTranscript ? <TraceRuleIdleTime projectId={projectId} /> : null}
      <RuleSamplingSection store={store} />
    </Stepper>
  );
}
