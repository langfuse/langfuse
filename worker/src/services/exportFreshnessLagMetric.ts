import { recordDistribution } from "@langfuse/shared/src/server";

export const EXPORT_FRESHNESS_LAG_METRIC =
  "langfuse.export.freshness_lag_seconds";

export type ExportFreshnessIntegration =
  | "blob_storage"
  | "posthog"
  | "mixpanel";

export type ExportFreshnessWindow = "20m" | "1h" | "1d" | "1w";

export type ExportFreshnessStatus = "success" | "failure";

const BLOB_FREQUENCY_TO_WINDOW: Record<string, ExportFreshnessWindow> = {
  every_20_minutes: "20m",
  hourly: "1h",
  daily: "1d",
  weekly: "1w",
};

export const windowClassFromBlobFrequency = (
  frequency: string,
): ExportFreshnessWindow => {
  const window = BLOB_FREQUENCY_TO_WINDOW[frequency];
  if (!window) {
    throw new Error(`Unsupported export frequency: ${frequency}`);
  }
  return window;
};

/**
 * Whether the run's export window was capped below present-day, i.e. the
 * integration is still working through a backlog. Catch-up runs report a large
 * lag by design, so the tag lets SLI queries filter them out deterministically
 * instead of guessing from the P95 tail. "unknown" is emitted where a run
 * failed before the window-capping fact could be determined.
 */
export type ExportFreshnessCatchup = boolean | undefined;

/**
 * Seconds the newest successfully-exported timestamp lags this run's start.
 * On success, pass the watermark just written (this run's maxTimestamp).
 * On failure, pass the unchanged lastSyncAt so lag climbs until recovery.
 * First runs with no watermark yet are skipped.
 *
 * Pass `catchup` when the run knows whether its window was capped below
 * present; omit it on failure paths that cannot determine this.
 */
export const recordExportFreshnessLag = ({
  integration,
  window,
  status,
  runStartTime,
  maxExportedTimestamp,
  catchup,
}: {
  integration: ExportFreshnessIntegration;
  window: ExportFreshnessWindow;
  status: ExportFreshnessStatus;
  runStartTime: Date;
  maxExportedTimestamp: Date | null | undefined;
  catchup?: ExportFreshnessCatchup;
}): void => {
  if (!maxExportedTimestamp) {
    return;
  }
  const lagSeconds =
    (runStartTime.getTime() - maxExportedTimestamp.getTime()) / 1000;
  recordDistribution(EXPORT_FRESHNESS_LAG_METRIC, Math.max(0, lagSeconds), {
    integration,
    window,
    status,
    catchup: catchup === undefined ? "unknown" : String(catchup),
    unit: "seconds",
  });
};
