import { FilterState } from "../types";
import { type TriggerDomain, TriggerEventSource } from "../domain/automations";
import { InMemoryFilterService } from "./services/InMemoryFilterService";

/** matchesTriggerFilter returns true when data satisfies a trigger's filter. Appends a synthetic "action" clause (from eventActions) and, for monitor-source triggers only, a synthetic "triggerIds any-of [id]" clause so monitors opt in by listing trigger IDs. */
export const matchesTriggerFilter = (
  data: Record<string, unknown>,
  trigger: Pick<
    TriggerDomain,
    "id" | "eventSource" | "filter" | "eventActions"
  >,
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

  // Prompt-source triggers never carry a triggerIds field on the event data,
  // so the opt-in clause must be scoped to monitor-source triggers.
  if (trigger.eventSource === TriggerEventSource.Monitor) {
    synthetic.push({
      column: "triggerIds",
      operator: "any of",
      type: "arrayOptions",
      value: [trigger.id],
    });
  }

  const mergedFilter: FilterState = [...trigger.filter, ...synthetic];

  return InMemoryFilterService.evaluateFilter(
    data,
    mergedFilter,
    (d, column) => (d as Record<string, unknown>)[column],
  );
};
