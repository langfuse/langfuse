import { type MonitorWindow, windowToMs } from "@langfuse/shared/monitors";

/** monitorPreviewBucketCount is the number of complete window buckets the preview renders. */
export const monitorPreviewBucketCount = 20;

/** monitorFilterOptionsLookbackFloorMs is the 7d floor guaranteeing non-empty filter suggestions for small windows. */
const monitorFilterOptionsLookbackFloorMs = 7 * 24 * 60 * 60 * 1000;

/** getMonitorPreviewRange returns the 20-bucket preview span ending at the last floored window boundary. */
export const getMonitorPreviewRange = (
  window: MonitorWindow,
  now: number,
): MonitorPreviewRange => {
  const bucketMs = Number(windowToMs(window));
  const to = Math.floor(now / bucketMs) * bucketMs;
  const from = to - monitorPreviewBucketCount * bucketMs;
  return { from: new Date(from), to: new Date(to), bucketMs };
};

/** getMonitorFilterOptionsLookbackFrom returns the discovery lower bound: the preview `to` minus max(20×window, 7d). */
export const getMonitorFilterOptionsLookbackFrom = (
  window: MonitorWindow,
  now: number,
): Date => {
  const { to, bucketMs } = getMonitorPreviewRange(window, now);
  const spanMs = Math.max(
    monitorPreviewBucketCount * bucketMs,
    monitorFilterOptionsLookbackFloorMs,
  );
  return new Date(to.getTime() - spanMs);
};

/** MonitorPreviewRange is the bucketed [from, to] preview span plus the per-bucket width. */
type MonitorPreviewRange = {
  from: Date;
  to: Date;
  bucketMs: number;
};
