import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

export function getExternalMediaStorageStatus(
  config: object | null,
): Status | undefined {
  return config ? "active" : undefined;
}

/** Shared by the integration page and the integrations overview card. */
export function useExternalMediaStorage(
  projectId: string,
  meta?: Record<string, unknown>,
) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const featureAvailability =
    api.externalMediaStorage.isFeatureEnabled.useQuery(
      { projectId },
      { enabled: Boolean(projectId) },
    );
  const isFeatureEnabled = featureAvailability.data === true;
  const query = api.externalMediaStorage.get.useQuery(
    { projectId },
    { enabled: Boolean(projectId && hasAccess && isFeatureEnabled), meta },
  );
  const status = query.data
    ? getExternalMediaStorageStatus(query.data.config)
    : undefined;

  return { hasAccess, featureAvailability, isFeatureEnabled, query, status };
}
