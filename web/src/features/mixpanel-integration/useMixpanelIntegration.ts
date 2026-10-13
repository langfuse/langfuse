import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

export function getMixpanelStatus(
  config: { enabled: boolean } | null,
): Status | undefined {
  if (!config) return undefined;
  return config.enabled ? "active" : "inactive";
}

/** Shared by the integration page and the integrations overview card. */
export function useMixpanelIntegration(projectId: string) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const query = api.mixpanelIntegration.get.useQuery(
    { projectId },
    { enabled: hasAccess },
  );
  const status = query.data ? getMixpanelStatus(query.data.config) : undefined;

  return { hasAccess, query, status };
}
