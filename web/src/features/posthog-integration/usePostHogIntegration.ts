import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

// A persisted fault outranks active/inactive: it is the state the admin has
// to act on, and it is cleared by the next successful sync.
export function getPostHogStatus(
  config: { enabled: boolean; lastError: string | null } | null,
): Status | undefined {
  if (!config) return undefined;
  if (config.lastError) return "error";
  return config.enabled ? "active" : "inactive";
}

/** Shared by the integration page and the integrations overview card. */
export function usePostHogIntegration(projectId: string) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const query = api.posthogIntegration.get.useQuery(
    { projectId },
    { enabled: hasAccess },
  );
  const status = query.data ? getPostHogStatus(query.data.config) : undefined;

  return { hasAccess, query, status };
}
