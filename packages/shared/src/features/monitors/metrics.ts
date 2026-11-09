import { recordDistribution } from "../../server/instrumentation";
import { getProjectSize } from "../../server/projectSize";
import {
  queryWindowFromMs,
  type QueryWindow,
} from "../../server/clickhouse/queryWindow";
import { windowToMs, type MonitorWindow } from "./types";

const monitorEvaluationLatencyMetric = "langfuse.alerts.evaluation_latency";
const monitorAlertDeliveryLatencyMetric = "langfuse.alerts.delivery_latency";

/** recordMonitorEvaluationLatency emits the ms from a monitor event's `runAt` until its evaluation finished, once per evaluated monitor. */
export function recordMonitorEvaluationLatency(args: {
  projectId: string;
  window: MonitorWindow;
  runAt: Date;
  result: MonitorEvaluationResult;
  monitors: number;
  now?: Date;
}): void {
  const now = args.now ?? new Date();
  const latencyMs = now.getTime() - args.runAt.getTime();
  const tags = {
    result: args.result,
    project_size: getProjectSize(args.projectId),
    query_window: monitorQueryWindow(args.window),
  };
  for (let i = 0; i < args.monitors; i++) {
    recordDistribution(monitorEvaluationLatencyMetric, latencyMs, tags);
  }
}

/** recordMonitorAlertDeliveryLatency emits the ms from a monitor alert's `timestamp` until its delivery reached a terminal result. */
export function recordMonitorAlertDeliveryLatency(args: {
  projectId: string;
  window: MonitorWindow;
  alertTimestamp: Date;
  actionType: string;
  result: MonitorAlertDeliveryResult;
  reason: MonitorAlertDeliveryReason;
  now?: Date;
}): void {
  const now = args.now ?? new Date();
  recordDistribution(
    monitorAlertDeliveryLatencyMetric,
    now.getTime() - args.alertTimestamp.getTime(),
    {
      result: args.result,
      reason: args.reason,
      action_type: args.actionType,
      project_size: getProjectSize(args.projectId),
      query_window: monitorQueryWindow(args.window),
    },
  );
}

/** monitorQueryWindow buckets a monitor's evaluation window with the ClickHouse query-window buckets. */
function monitorQueryWindow(window: MonitorWindow): QueryWindow {
  return queryWindowFromMs(Number(windowToMs(window)));
}

export type MonitorEvaluationResult = "success" | "error";

export type MonitorAlertDeliveryResult = "delivered" | "dropped" | "failed";

export type MonitorAlertDeliveryReason =
  | "monitor_deleted"
  | "newer_alert"
  | "none";
