import { computeSeverity } from "./computeSeverity";
import {
  MonitorNoDataModeSchema,
  MonitorSeveritySchema,
  type MonitorNoData,
  type MonitorSeverity,
  type MonitorThresholdOperator,
} from "../types";

/** resolveNoDataSeverity interprets a null metric value into a severity per the monitor's noData mode. */
export function resolveNoDataSeverity(args: {
  noData: MonitorNoData;
  prevSeverity: MonitorSeverity;
  operator: MonitorThresholdOperator;
  alertThreshold: number;
  warningThreshold: number | null;
}): MonitorSeverity {
  switch (args.noData.mode) {
    case MonitorNoDataModeSchema.enum.SUBSTITUTE_ZERO:
      return computeSeverity({
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
