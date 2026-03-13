import type { BlobStorageSyncStatus } from "@/src/features/blobstorage-integration/types";

export function deriveSyncStatus(integration: {
  enabled: boolean;
  lastError: string | null;
  lastSyncAt: Date | null;
  nextSyncAt: Date | null;
}): BlobStorageSyncStatus {
  if (!integration.enabled) return "disabled";
  if (integration.lastError) return "error";
  if (!integration.lastSyncAt) return "idle";

  const now = new Date();
  if (integration.nextSyncAt && integration.nextSyncAt <= now) {
    return "queued";
  }

  return "up_to_date";
}
