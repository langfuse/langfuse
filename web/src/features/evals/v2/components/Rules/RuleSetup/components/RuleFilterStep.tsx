import { EvalTargetObject, TopicsTargetObject } from "@langfuse/shared";
import { useId, useState } from "react";
import { useStore } from "zustand";

import { Radio } from "@/src/components/design-system/Radio/Radio";
import { useCanViewTraceTranscriptsEvals } from "@/src/features/evals/transcriptEvalsAccess";
import { RuleSampleObservationSelector } from "@/src/features/evals/v2/components/Evaluators/Testing/components/RuleSampleObservationSelector/RuleSampleObservationSelector";
import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";
import { ruleScopeCopy } from "@/src/features/evals/v2/constants/ruleScopeCopy";
import { env } from "@/src/env.mjs";
import { TraceRuleIdleTime } from "@/src/features/evals/v2/components/Rules/RuleSetup/components/TraceRuleIdleTime/TraceRuleIdleTime";
import { RuleSamplingSection } from "./RuleSamplingSection";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
/** The rule scope is chosen on create and fixed on edit, or on create when `lockScope` is set. */
export function RuleFilterStep({
  projectId,
  store,
  mode,
  lockScope = false,
}: {
  projectId: string;
  store: RuleSetupStore;
  mode: "create" | "edit";
  /** Fixes the scope on create when the caller already tested the evaluator against it. */
  lockScope?: boolean;
}) {
  const filter = useStore(store, (state) => state.filter);
  const selectedObservationId = useStore(
    store,
    (state) => state.selectedObservation?.id ?? null,
  );
  const targetObject = useStore(store, (state) => state.targetObject);
  const traceEvalsAvailable = useCanViewTraceTranscriptsEvals(projectId);
  const [timeRange] = useState(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - SEVEN_DAYS_MS), to };
  });
  const scopeGroupName = useId();
  const { actions } = store.getState();
  const isTraceTranscript = targetObject === TopicsTargetObject;
  // Trace scope exists for event rules only, so experiment rules keep the
  // observation-only step and the observation option always means events.
  const scopeSelectable =
    (traceEvalsAvailable || isTraceTranscript) &&
    targetObject !== EvalTargetObject.EXPERIMENT;
  const scopeLocked = mode === "edit" || lockScope;
  const scopeLockedNote =
    mode === "edit"
      ? "Scope is fixed after creation."
      : "Scope matches how the evaluator was tested.";
  const copy = ruleScopeCopy(targetObject, scopeSelectable);
  return (
    <Stepper
      number={1}
      title="Configure rule scope"
      description={copy.stepDescription}
    >
      {scopeSelectable && (
        <div
          role="radiogroup"
          aria-label="Scope"
          className="flex items-center gap-4"
        >
          <label className="flex items-center gap-2 text-sm">
            <Radio
              name={scopeGroupName}
              value={EvalTargetObject.EVENT}
              checked={!isTraceTranscript}
              disabled={scopeLocked}
              onChange={() => actions.setTargetObject(EvalTargetObject.EVENT)}
            />
            Observation
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Radio
              name={scopeGroupName}
              value={TopicsTargetObject}
              checked={isTraceTranscript}
              disabled={scopeLocked}
              onChange={() => actions.setTargetObject(TopicsTargetObject)}
            />
            Trace messages
          </label>
          {scopeLocked ? (
            <span className="text-muted-foreground text-xs">
              {scopeLockedNote}
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
        selectedObservationId={selectedObservationId}
        onSelect={actions.setSelectedObservation}
        targetObject={targetObject}
        filterTitle={copy.filterTitle}
        filterDescription={copy.filterDescription}
        filterTooltip={copy.filterTooltip}
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
      {isTraceTranscript ? <TraceRuleIdleTime projectId={projectId} /> : null}
      <RuleSamplingSection store={store} {...copy.sampling} />
    </Stepper>
  );
}
