import { FilterState } from "../types";
import { type TriggerDomain } from "../domain/automations";
import { InMemoryFilterService } from "./services/InMemoryFilterService";

/** matchesTriggerFilter returns true when data satisfies a trigger's filter. Appends a synthetic "action" clause (from eventActions) and, when the event data carries a triggerIds array, a synthetic "triggerIds any-of [id]" clause so the data can opt into a trigger by listing its ID. */
export const matchesTriggerFilter = (
  data: Record<string, unknown>,
  trigger: Pick<TriggerDomain, "id" | "filter" | "eventActions">,
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

  // Data-side opt-in: if the event publishes a triggerIds array, gate by it.
  // Sources that don't publish the field (eg. prompt-version events) skip it.
  if (Array.isArray(data.triggerIds)) {
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
