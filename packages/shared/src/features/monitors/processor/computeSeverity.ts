import {
  MonitorThresholdOperatorSchema,
  type MonitorThresholdOperator,
  MonitorSeveritySchema,
  type MonitorSeverity,
} from "../types";

/** computeSeverity maps a metric value to a non-lifecycle severity by comparing it against the alert (and optional warning) thresholds. */
export function computeSeverity(args: {
  value: number;
  operator: MonitorThresholdOperator;
  alertThreshold: number;
  warningThreshold: number | null;
}): MonitorSeverity {
  if (matches(args.value, args.operator, args.alertThreshold)) {
    return MonitorSeveritySchema.enum.ALERT;
  }
  if (
    args.warningThreshold !== null &&
    matches(args.value, args.operator, args.warningThreshold)
  ) {
    return MonitorSeveritySchema.enum.WARNING;
  }
  return MonitorSeveritySchema.enum.OK;
}

/** matches returns true when `value <op> threshold` holds. */
function matches(
  value: number,
  operator: MonitorThresholdOperator,
  threshold: number,
): boolean {
  switch (operator) {
    case MonitorThresholdOperatorSchema.enum.GT:
      return value > threshold;
    case MonitorThresholdOperatorSchema.enum.GTE:
      return value >= threshold;
    case MonitorThresholdOperatorSchema.enum.LT:
      return value < threshold;
    case MonitorThresholdOperatorSchema.enum.LTE:
      return value <= threshold;
    case MonitorThresholdOperatorSchema.enum.EQ:
      return value === threshold;
    case MonitorThresholdOperatorSchema.enum.NEQ:
      return value !== threshold;
  }
  return false;
}
