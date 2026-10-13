import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

// A stored workspace that fails validation is an error the admin has to fix
// by reconnecting, not an unconfigured integration.
export function getSlackStatus(integration: {
  isConnected: boolean;
  teamId: string | null;
}): Status | undefined {
  if (integration.isConnected) return "active";
  return integration.teamId ? "error" : undefined;
}

/** Shared by the integration page and the integrations overview card. */
export function useSlackIntegration(projectId: string) {
  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "automations:read",
  });
  const query = api.slack.getIntegrationStatus.useQuery(
    { projectId },
    { enabled: Boolean(projectId) && hasReadAccess },
  );
  const status = query.data ? getSlackStatus(query.data) : undefined;

  return { query, status };
}
