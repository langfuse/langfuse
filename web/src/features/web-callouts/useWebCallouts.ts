import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

// A project can have several endpoints; the integration counts as active as
// soon as one of them is enabled.
export function getWebCalloutsStatus(
  endpoints: { enabled: boolean }[],
): Status | undefined {
  if (endpoints.length === 0) return undefined;
  return endpoints.some((endpoint) => endpoint.enabled) ? "active" : "inactive";
}

/** Shared by the integration page and the integrations overview card. */
export function useWebCallouts(
  projectId: string | undefined,
  meta?: Record<string, unknown>,
) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const query = api.webCallouts.all.useQuery(
    { projectId: projectId ?? "" },
    { enabled: Boolean(projectId) && hasAccess, meta },
  );
  const status = query.data ? getWebCalloutsStatus(query.data) : undefined;

  return { hasAccess, query, status };
}
