import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

// An unconfigured integration reads as inactive on the integration page; the
// overview card hides the badge instead (see `isConfigured`).
export function getMixpanelStatus(config: { enabled: boolean } | null): Status {
  return config?.enabled ? "active" : "inactive";
}

/** Shared by the integration page and the integrations overview card. */
export function useMixpanelIntegration(
  projectId: string,
  meta?: Record<string, unknown>,
) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const query = api.mixpanelIntegration.get.useQuery(
    { projectId },
    { enabled: hasAccess, meta },
  );
  const status =
    query.isLoading || !hasAccess
      ? undefined
      : getMixpanelStatus(query.data?.config ?? null);
  const isConfigured = Boolean(query.data?.config);

  return { hasAccess, query, status, isConfigured };
}
