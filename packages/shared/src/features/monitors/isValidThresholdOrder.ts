/** isValidThresholdOrder.ts contains the warning-vs-alert threshold ordering
 * predicate. Consumed as a zod `superRefine` from the Monitor input schemas
 * via `validateThresholdOrder` in `./types`. */
import { type MonitorThresholdOperator } from "./types";

/** isValidThresholdOrder returns ok when the warning and alert thresholds are ordered correctly for the given operator; null `warningThreshold` and the unordered `EQ`/`NEQ` operators always pass. */
export const isValidThresholdOrder = (monitor: {
  thresholdOperator: MonitorThresholdOperator;
  alertThreshold: number;
  warningThreshold: number | null;
}): { valid: true } | { valid: false; reason: string } => {
  if (monitor.warningThreshold == null) return { valid: true };
  switch (monitor.thresholdOperator) {
    case "GT":
    case "GTE":
      if (monitor.warningThreshold < monitor.alertThreshold) {
        return { valid: true };
      }
      return {
        valid: false,
        reason: "alertThreshold must be > warningThreshold",
      };
    case "LT":
    case "LTE":
      if (monitor.warningThreshold > monitor.alertThreshold) {
        return { valid: true };
      }
      return {
        valid: false,
        reason: "alertThreshold must be < warningThreshold",
      };
    case "EQ":
    case "NEQ":
      return { valid: true };
  }
};
