import {
  TopicsTargetObject,
  type EvalTargetObject,
  type FilterState,
} from "@langfuse/shared";

/** Observation rules start on root spans; trace rules start with no filter. */
export function resolveInitialRuleFilters(
  initialFilter?: FilterState,
  targetObject?: EvalTargetObject | typeof TopicsTargetObject,
): FilterState {
  if (targetObject === TopicsTargetObject) return initialFilter ?? [];
  return (
    initialFilter ?? [
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ]
  );
}
