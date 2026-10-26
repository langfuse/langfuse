import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

/** getStatus reports active once at least one routing key is stored. */
function getStatus(
  isLoading: boolean,
  isConfigured: boolean,
): Status | undefined {
  if (isLoading || !isConfigured) return undefined;
  return "active";
}

/** usePagerDutyIntegrations loads a project's PagerDuty routing keys for the settings page, the integrations card and action forms. */
export function usePagerDutyIntegrations(
  projectId: string | undefined,
  meta?: Record<string, unknown>,
) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:read",
  });
  const query = api.pagerDuty.list.useQuery(
    { projectId: projectId ?? "" },
    { enabled: Boolean(projectId) && hasAccess, meta },
  );
  const isConfigured = (query.data?.length ?? 0) > 0;

  return {
    query,
    status: getStatus(query.isLoading, isConfigured),
    isConfigured,
  };
}
