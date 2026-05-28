import { FilterState } from "../types";
import { type TriggerEventAction } from "../domain/automations";
import { InMemoryFilterService } from "./services/InMemoryFilterService";

/** matchesTriggerFilter returns true when data satisfies a trigger's filter, with a synthetic "action" clause (from eventActions) and a synthetic "triggerIds any-of [triggerId]" clause appended so monitors opt in by listing trigger IDs. */
export const matchesTriggerFilter = (
  data: Record<string, unknown>,
  trigger: {
    triggerId: string;
    filter: FilterState;
    eventActions: TriggerEventAction[];
  },
): boolean => {
  const synthetic: FilterState = [];

  if (trigger.eventActions.length > 0) {
    synthetic.push({
      column: "action",
      operator: "any of",
      type: "stringOptions",
      value: trigger.eventActions,
    });
  }

  synthetic.push({
    column: "triggerIds",
    operator: "any of",
    type: "arrayOptions",
    value: [trigger.triggerId],
  });

  const mergedFilter: FilterState = [...trigger.filter, ...synthetic];

  return InMemoryFilterService.evaluateFilter(
    data,
    mergedFilter,
    (d, column) => (d as Record<string, unknown>)[column],
  );
};
