/** isValidThresholdOrder.ts contains the warning-vs-alert threshold ordering
 * predicate. Consumed as a zod `superRefine` from the Monitor input schemas
 * via `validateThresholdOrder` in `./types`. */
import { type MonitorThresholdOperator } from "./types";

/**
 * isValidThresholdOrder returns true when the warning and alert thresholds
 * are ordered correctly for the given operator. Null `warningThreshold` and
 * the unordered `eq`/`neq` operators always pass.
 */
export const isValidThresholdOrder = (monitor: {
  thresholdOperator: MonitorThresholdOperator;
  alertThreshold: number;
  warningThreshold: number | null;
}): boolean => {
  if (monitor.warningThreshold == null) return true;
  switch (monitor.thresholdOperator) {
    case "GT":
    case "GTE":
      return monitor.warningThreshold < monitor.alertThreshold;
    case "LT":
    case "LTE":
      return monitor.warningThreshold > monitor.alertThreshold;
    case "EQ":
    case "NEQ":
      return true;
  }
};
