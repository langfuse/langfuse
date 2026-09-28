import { recordDistribution } from "@langfuse/shared/src/server";

export const EXPORT_STALENESS_METRIC = "langfuse.export.staleness_seconds";

type ExportStalenessIntegration = "blob_storage" | "posthog" | "mixpanel";

type ExportStalenessWindow = "20m" | "1h" | "1d" | "1w" | "unknown";

const BLOB_FREQUENCY_TO_WINDOW: Record<string, ExportStalenessWindow> = {
  every_20_minutes: "20m",
  hourly: "1h",
  daily: "1d",
  weekly: "1w",
};

// Non-throwing: runs inside the scheduler, where one bad row must not block
// scheduling for every other integration.
export const windowClassFromBlobFrequency = (
  frequency: string,
): ExportStalenessWindow => BLOB_FREQUENCY_TO_WINDOW[frequency] ?? "unknown";

/**
 * Emits `now − lastSyncAt` for every enabled integration on each scheduler
 * tick. Sampling at a fixed cadence makes percentiles time-weighted, and an
 * integration that stops running keeps emitting a rising value instead of
 * going silent. Integrations without a watermark yet are skipped.
 */
export const recordExportStaleness = ({
  integration,
  now,
  integrations,
}: {
  integration: ExportStalenessIntegration;
  now: Date;
  integrations: { lastSyncAt: Date | null; window: ExportStalenessWindow }[];
}): void => {
  for (const { lastSyncAt, window } of integrations) {
    if (!lastSyncAt) continue;
    const stalenessSeconds = (now.getTime() - lastSyncAt.getTime()) / 1000;
    recordDistribution(EXPORT_STALENESS_METRIC, Math.max(0, stalenessSeconds), {
      integration,
      window,
      unit: "seconds",
    });
  }
};
