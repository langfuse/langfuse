import type { Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import type { BlobStorageSyncStatus } from "@/src/features/blobstorage-integration/types";

export const syncStatusToBadge: Record<BlobStorageSyncStatus, Status> = {
  up_to_date: "active",
  running: "running",
  queued: "queued",
  idle: "pending",
  disabled: "disabled",
  error: "error",
};

const MAX_RUN_AGE_MS = 2 * 60 * 60 * 1000;

export function deriveSyncStatus(integration: {
  enabled: boolean;
  lastError: string | null;
  lastSyncAt: Date | null;
  nextSyncAt: Date | null;
  runStartedAt: Date | null;
}): BlobStorageSyncStatus {
  if (!integration.enabled) return "disabled";
  if (integration.lastError) return "error";
  if (integration.runStartedAt) {
    const ageMs = Date.now() - integration.runStartedAt.getTime();
    if (ageMs < MAX_RUN_AGE_MS) return "running";
  }

  const now = new Date();
  if (integration.nextSyncAt && integration.nextSyncAt <= now) {
    return "queued";
  }

  if (!integration.lastSyncAt) return "idle";

  return "up_to_date";
}
