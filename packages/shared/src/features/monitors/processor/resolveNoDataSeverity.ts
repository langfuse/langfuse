import type { z } from "zod";

import { computeSeverity } from "./computeSeverity";
import {
  MonitorSeveritySchema,
  type MonitorNoData,
  type MonitorSeverity,
  type MonitorThresholdOperator,
} from "../types";
import type { metricAggregations } from "../../query/types";

/** additiveAggregations are the aggregations whose missing rows mean zero. */
const additiveAggregations = new Set<z.infer<typeof metricAggregations>>([
  "count",
  "sum",
  "uniq",
]);

/** resolveNoDataSeverity interprets a null metric value into a severity per the monitor's noData mode. */
export function resolveNoDataSeverity(args: {
  noData: MonitorNoData;
  aggregation: z.infer<typeof metricAggregations>;
  prevSeverity: MonitorSeverity;
  operator: MonitorThresholdOperator;
  alertThreshold: number;
  warningThreshold: number | null;
}): MonitorSeverity {
  const mode =
    args.noData.mode === "AUTOMATIC"
      ? additiveAggregations.has(args.aggregation)
        ? "SUBSTITUTE_ZERO"
        : "LAST_SEVERITY"
      : args.noData.mode;

  switch (mode) {
    case "SUBSTITUTE_ZERO":
      return computeSeverity({
        value: 0,
        operator: args.operator,
        alertThreshold: args.alertThreshold,
        warningThreshold: args.warningThreshold,
      });
    case "LAST_SEVERITY":
      return args.prevSeverity;
    case "RESOLVE":
      return MonitorSeveritySchema.enum.OK;
    case "SHOW_NO_DATA":
    case "NOTIFY_NO_DATA":
      return MonitorSeveritySchema.enum.NO_DATA;
  }
}
