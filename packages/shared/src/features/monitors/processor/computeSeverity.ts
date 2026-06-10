import {
  MonitorNoDataModeSchema,
  MonitorThresholdOperatorSchema,
  type MonitorNoData,
  type MonitorThresholdOperator,
  MonitorSeveritySchema,
  type MonitorSeverity,
} from "../types";

/** computeSeverity maps a metric value to a severity, interpreting a null value per the monitor's noData mode and otherwise comparing it against the alert and optional warning thresholds. */
export function computeSeverity(args: {
  value: number | null;
  noData: MonitorNoData;
  prevSeverity: MonitorSeverity;
  operator: MonitorThresholdOperator;
  alertThreshold: number;
  warningThreshold: number | null;
}): MonitorSeverity {
  if (args.value === null) {
    switch (args.noData.mode) {
      case MonitorNoDataModeSchema.enum.SUBSTITUTE_ZERO:
        return computeNonNullSeverity({
          value: 0,
          operator: args.operator,
          alertThreshold: args.alertThreshold,
          warningThreshold: args.warningThreshold,
        });
      case MonitorNoDataModeSchema.enum.LAST_SEVERITY:
        return args.prevSeverity;
      case MonitorNoDataModeSchema.enum.SHOW_NO_DATA:
      case MonitorNoDataModeSchema.enum.NOTIFY_NO_DATA:
        return MonitorSeveritySchema.enum.NO_DATA;
    }
  }
  return computeNonNullSeverity({
    value: args.value,
    operator: args.operator,
    alertThreshold: args.alertThreshold,
    warningThreshold: args.warningThreshold,
  });
}

/** computeNonNullSeverity maps a present metric value to a non-lifecycle severity by comparing it against the alert and optional warning thresholds. */
function computeNonNullSeverity(args: {
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
