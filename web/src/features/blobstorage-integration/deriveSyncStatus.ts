import type { BlobStorageSyncStatus } from "@/src/features/blobstorage-integration/types";

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;

const frequencyToMs: Record<string, number> = {
  every_20_minutes: 20 * 60 * 1000,
  hourly: ONE_HOUR_MS,
  daily: TWENTY_FOUR_HOURS_MS,
  weekly: 7 * TWENTY_FOUR_HOURS_MS,
};

function getMaxRunAgeMs(exportFrequency: string): number {
  const intervalMs = frequencyToMs[exportFrequency] ?? TWENTY_FOUR_HOURS_MS;
  return Math.max(ONE_HOUR_MS, Math.min(intervalMs, TWENTY_FOUR_HOURS_MS));
}

export function deriveSyncStatus(integration: {
  enabled: boolean;
  lastError: string | null;
  lastSyncAt: Date | null;
  nextSyncAt: Date | null;
  runStartedAt: Date | null;
  exportFrequency: string;
}): BlobStorageSyncStatus {
  if (!integration.enabled) return "disabled";
  if (integration.lastError) return "error";
  if (integration.runStartedAt) {
    const ageMs = Date.now() - integration.runStartedAt.getTime();
    if (ageMs < getMaxRunAgeMs(integration.exportFrequency)) return "running";
  }

  const now = new Date();
  if (integration.nextSyncAt && integration.nextSyncAt <= now) {
    return "queued";
  }

  if (!integration.lastSyncAt) return "idle";

  return "up_to_date";
}
