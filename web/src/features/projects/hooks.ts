import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

export const useQueryProject = () => {
  const router = useRouter();
  const projectId = router.query.projectId;
  return useProject(typeof projectId === "string" ? projectId : null);
};

export const useProject = (projectId: string | null) => {
  const session = useSession();
  const isAdmin = session.data?.user?.admin === true;

  // Always call hooks first, then handle conditional logic in the return
  const fromSession = projectId
    ? session.data?.user?.organizations
        // map to {project, organization}[]
        .flatMap((org) =>
          org.projects.map((project) => ({ project, organization: org })),
        )
        // find the project with the matching id
        .find(({ project }) => project.id === projectId)
    : null;

  // Admin fallback: Langfuse admins are not members of customer projects, so
  // the project/org is absent from their session. Resolve it (and its parent
  // org) from the admin-aware API instead. Disabled for everyone else, so
  // non-admins keep the exact previous behavior.
  const adminFallback = api.projects.byId.useQuery(
    { projectId: projectId as string },
    {
      enabled: Boolean(projectId) && isAdmin && !fromSession,
      staleTime: 60_000,
      // A stale/deleted project id is an expected miss for admins: resolve to
      // null like the session-only lookup, without retries, error toast, or
      // Sentry noise.
      retry: false,
      meta: { silentHttpCodes: [404] },
    },
  );

  if (fromSession) {
    return {
      project: fromSession.project,
      organization: fromSession.organization,
    };
  }

  if (isAdmin && adminFallback.data) {
    return {
      project: adminFallback.data.project,
      organization: adminFallback.data.organization,
    };
  }

  return {
    project: null,
    organization: null,
  };
};

export const useQueryProjectOrOrganization = () => {
  const p = useQueryProject();
  const o = useQueryOrganization();

  return p.project ? p : { organization: o, project: null };
};

/**
 * Builds the target path for switching the current page to a different
 * organization/project, preserving the page the user is on where possible
 * (e.g. staying on `.../traces` when switching projects). Shared by every
 * org/project switcher (breadcrumb, mobile nav drawer) so switching behavior
 * stays identical across entry points.
 */
export const useOrgProjectSwitchPaths = () => {
  const router = useRouter();

  /**
   * Truncate the path before the first dynamic segment that is not allowlisted.
   * e.g. /project/[projectId]/traces/[traceId] -> /project/[projectId]/traces
   */
  const truncatePathBeforeDynamicSegments = (path: string) => {
    const allowlistedIds = ["[projectId]", "[organizationId]", "[page]"];
    const segments = router.route.split("/");
    const idSegments = segments.filter(
      (segment) => segment.startsWith("[") && segment.endsWith("]"),
    );
    const stopSegment = idSegments.filter((id) => !allowlistedIds.includes(id));
    if (stopSegment.length === 0) return path;
    const stopIndex = segments.indexOf(stopSegment[0]);
    const truncatedPath = path.split("/").slice(0, stopIndex).join("/");
    return truncatedPath;
  };

  const getProjectPath = (projectId: string) =>
    router.query.projectId
      ? truncatePathBeforeDynamicSegments(router.asPath).replace(
          router.query.projectId as string,
          projectId,
        )
      : `/project/${projectId}`;

  const getOrgPath = (orgId: string) =>
    router.query.organizationId
      ? truncatePathBeforeDynamicSegments(router.asPath).replace(
          router.query.organizationId as string,
          orgId,
        )
      : `/organization/${orgId}`;

  return { getProjectPath, getOrgPath };
};
