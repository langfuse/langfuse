import type { MonitorThresholdOperator } from "../types";

/** ComputedSeverity is the subset of MonitorSeverity that the processor derives from a metric value — never UNKNOWN (cold-start) or PAUSED (lifecycle). */
export type ComputedSeverity = "NO_DATA" | "OK" | "WARNING" | "ALERT";

/** computeSeverity maps a metric value to a non-lifecycle severity by comparing it against the alert (and optional warning) thresholds. */
export function computeSeverity(args: {
  value: number | null;
  operator: MonitorThresholdOperator;
  alertThreshold: number;
  warningThreshold: number | null;
}): ComputedSeverity {
  if (args.value === null) return "NO_DATA";
  if (matches(args.value, args.operator, args.alertThreshold)) return "ALERT";
  if (
    args.warningThreshold !== null &&
    matches(args.value, args.operator, args.warningThreshold)
  ) {
    return "WARNING";
  }
  return "OK";
}

/** matches returns true when `value <op> threshold` holds. */
function matches(
  value: number,
  operator: MonitorThresholdOperator,
  threshold: number,
): boolean {
  switch (operator) {
    case "GT":
      return value > threshold;
    case "GTE":
      return value >= threshold;
    case "LT":
      return value < threshold;
    case "LTE":
      return value <= threshold;
    case "EQ":
      return value === threshold;
    case "NEQ":
      return value !== threshold;
  }
}
