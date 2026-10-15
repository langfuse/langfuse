import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

// A persisted fault outranks active/inactive: it is the state the admin has
// to act on, and it is cleared by the next successful sync. An unconfigured
// integration reads as inactive on the integration page; the overview card
// hides the badge instead (see `isConfigured`).
export function getPostHogStatus(
  config: { enabled: boolean; lastError: string | null } | null,
): Status {
  if (config?.lastError) return "error";
  return config?.enabled ? "active" : "inactive";
}

/** Shared by the integration page and the integrations overview card. */
export function usePostHogIntegration(
  projectId: string,
  meta?: Record<string, unknown>,
) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const query = api.posthogIntegration.get.useQuery(
    { projectId },
    { enabled: hasAccess, meta },
  );
  const status =
    query.isLoading || !hasAccess
      ? undefined
      : getPostHogStatus(query.data?.config ?? null);
  const isConfigured = Boolean(query.data?.config);
  return { hasAccess, query, status, isConfigured };
}
