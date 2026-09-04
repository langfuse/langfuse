import type { FilterState } from "@langfuse/shared";

export function resolveInitialRuleFilters(
  initialFilter?: FilterState,
): FilterState {
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
