import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

// A stored workspace that fails validation reads as inactive, same as no
// workspace; the overview card hides the badge when none is stored (see
// `isConfigured`).
export function getSlackStatus(
  integration: { isConnected: boolean } | undefined,
): Status {
  return integration?.isConnected ? "active" : "inactive";
}

/** Shared by the integration page and the integrations overview card. */
export function useSlackIntegration(
  projectId: string,
  meta?: Record<string, unknown>,
) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:read",
  });
  const query = api.slack.getIntegrationStatus.useQuery(
    { projectId },
    { enabled: Boolean(projectId) && hasAccess, meta },
  );
  const status =
    query.isLoading || !hasAccess ? undefined : getSlackStatus(query.data);
  const isConfigured = Boolean(query.data?.teamId);

  return { query, status, isConfigured };
}
