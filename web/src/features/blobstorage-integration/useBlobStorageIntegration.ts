import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { useHasEntitlement } from "@/src/features/entitlements";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import {
  deriveSyncStatus,
  syncStatusToBadge,
} from "@/src/features/blobstorage-integration/deriveSyncStatus";

export function getBlobStorageStatus(
  config: Parameters<typeof deriveSyncStatus>[0] | null,
): Status | undefined {
  if (!config) return undefined;
  return syncStatusToBadge[deriveSyncStatus(config)];
}

/** Shared by the integration page and the integrations overview card. */
export function useBlobStorageIntegration(
  projectId: string,
  meta?: Record<string, unknown>,
) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const hasEntitlement = useHasEntitlement("scheduled-blob-exports");
  const query = api.blobStorageIntegration.get.useQuery(
    { projectId },
    {
      enabled: hasAccess && hasEntitlement,
      meta,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 50 * 60 * 1000, // 50 minutes
      // Poll while an export is in flight so the badge moves on by itself.
      refetchInterval: (query) => {
        const status = getBlobStorageStatus(query.state.data?.config ?? null);
        return status === "running" || status === "queued" ? 5_000 : false;
      },
    },
  );
  const status =
    hasAccess && hasEntitlement && query.data
      ? getBlobStorageStatus(query.data.config)
      : undefined;

  return { hasAccess, hasEntitlement, query, status };
}
