import { type TriggerDomain } from "../domain/automations";
import { FilterState } from "../types";
import { InMemoryFilterService } from "./services/InMemoryFilterService";

/** matchesTriggerFilter returns true when data satisfies a trigger's filter, treating `trigger.eventActions` as a synthetic "action" condition appended to the filter. */
export const matchesTriggerFilter = (
  data: Record<string, unknown>,
  trigger: Pick<TriggerDomain, "filter" | "eventActions">,
): boolean => {
  const mergedFilter: FilterState =
    trigger.eventActions.length > 0
      ? [
          ...trigger.filter,
          {
            column: "action",
            operator: "any of",
            type: "stringOptions",
            value: trigger.eventActions,
          },
        ]
      : trigger.filter;
  return InMemoryFilterService.evaluateFilter(
    data,
    mergedFilter,
    (d, column) => (d as Record<string, unknown>)[column],
  );
};
