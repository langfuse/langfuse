import { getProjectSize } from "../../../server/projectSize";
import { queryWindowFromMs } from "../../../server/clickhouse/queryWindow";
import { type QueueName, type TQueueJobTypes } from "../../../server/queues";
import { windowToMs } from "../types";

/** monitorQueueMetricTags tags monitor queue metrics with the event's project size and query window. */
export function monitorQueueMetricTags(
  data: TQueueJobTypes[QueueName.MonitorQueue],
): Record<string, string> {
  return {
    project_size: getProjectSize(data.payload.projectId),
    query_window: queryWindowFromMs(Number(windowToMs(data.payload.window))),
  };
}
