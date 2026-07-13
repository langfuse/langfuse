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
