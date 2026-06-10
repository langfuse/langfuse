import { computeSeverity } from "./computeSeverity";
import {
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
    case "SUBSTITUTE_ZERO":
      return computeSeverity({
        value: 0,
        operator: args.operator,
        alertThreshold: args.alertThreshold,
        warningThreshold: args.warningThreshold,
      });
    case "LAST_SEVERITY":
      return args.prevSeverity;
    case "SHOW_NO_DATA":
    case "NOTIFY_NO_DATA":
      return MonitorSeveritySchema.enum.NO_DATA;
  }
}
