import { recordDistribution } from "../../server/instrumentation";
import { getProjectSize } from "../../server/projectSize";
import {
  queryWindowFromMs,
  type QueryWindow,
} from "../../server/clickhouse/queryWindow";
import { windowToMs, type MonitorWindow } from "./types";

/**
 * Milliseconds from a monitor event's scheduled `runAt` until the evaluation
 * of one of its monitors finished, success or failure. Covers the scheduler
 * tick, queue wait, the ClickHouse query and processing; excludes delivery.
 * Emitted once per evaluated monitor.
 */
export const MONITOR_EVALUATION_LATENCY_METRIC =
  "langfuse.alerts.evaluation_latency";

/**
 * Milliseconds from a monitor alert's `timestamp` (the evaluation's `runAt`)
 * until its delivery reached a terminal result. Emitted once per alert and
 * automation: on delivery, on a stale-alert drop, or on a failure with no
 * retry left. Retries in between emit nothing.
 */
export const MONITOR_ALERT_DELIVERY_LATENCY_METRIC =
  "langfuse.alerts.delivery_latency";

export type MonitorEvaluationResult = "success" | "error";

export type MonitorAlertDeliveryResult = "delivered" | "dropped" | "failed";

export type MonitorAlertDeliveryReason =
  | "monitor_deleted"
  | "newer_alert"
  | "none";

/** monitorQueryWindow buckets a monitor's evaluation window with the ClickHouse query-window buckets. */
export function monitorQueryWindow(window: MonitorWindow): QueryWindow {
  return queryWindowFromMs(Number(windowToMs(window)));
}

export function recordMonitorEvaluationLatency(args: {
  projectId: string;
  window: MonitorWindow;
  runAt: Date;
  result: MonitorEvaluationResult;
  now?: Date;
}): void {
  const now = args.now ?? new Date();
  recordDistribution(
    MONITOR_EVALUATION_LATENCY_METRIC,
    now.getTime() - args.runAt.getTime(),
    {
      result: args.result,
      project_size: getProjectSize(args.projectId),
      query_window: monitorQueryWindow(args.window),
    },
  );
}

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
    MONITOR_ALERT_DELIVERY_LATENCY_METRIC,
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
