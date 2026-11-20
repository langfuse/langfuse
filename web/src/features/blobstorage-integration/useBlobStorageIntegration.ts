import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import {
  deriveSyncStatus,
  syncStatusToBadge,
} from "@/src/features/blobstorage-integration/deriveSyncStatus";

/** @internal */
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
      // Not gated on the entitlement: after a downgrade the page still shows
      // why the export stopped and lets the user delete the integration.
      enabled: hasAccess,
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
    hasAccess && query.data
      ? getBlobStorageStatus(query.data.config)
      : undefined;

  return { hasAccess, hasEntitlement, query, status };
}

/** Deletes the integration and its stored credentials. */
export function useDeleteBlobStorageIntegration(projectId: string) {
  const utils = api.useUtils();
  return api.blobStorageIntegration.delete.useMutation({
    onSuccess: () => {
      utils.blobStorageIntegration.getExternalId.reset({ projectId });
      utils.blobStorageIntegration.invalidate();
    },
  });
}
