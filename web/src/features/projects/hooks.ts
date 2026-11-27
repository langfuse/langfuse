/* eslint-disable @typescript-eslint/no-use-before-define */
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { env } from "@/src/env.mjs";

export const useQueryProject = () => {
  const router = useRouter();
  const projectId = router.query.projectId;
  return useProject(typeof projectId === "string" ? projectId : null);
};

export const useProject = (projectId: string | null) => {
  const session = useSession();

  const fromSession = projectId
    ? session.data?.user?.organizations
        // map to {project, organization}[]
        .flatMap((org) =>
          org.projects.map((project) => ({ project, organization: org })),
        )
        // find the project with the matching id
        .find(({ project }) => project.id === projectId)
    : null;

  if (fromSession) {
    return {
      project: fromSession.project,
      organization: fromSession.organization,
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
  const session = useSession();

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

  const getOrgPath = (orgId: string) => {
    // The demo org has a single project, so skip its org overview.
    if (
      orgId === env.NEXT_PUBLIC_DEMO_ORG_ID &&
      env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
      session.data?.user?.organizations
        .find((organization) => organization.id === orgId)
        ?.projects.some(
          (project) => project.id === env.NEXT_PUBLIC_DEMO_PROJECT_ID,
        )
    ) {
      return `/project/${env.NEXT_PUBLIC_DEMO_PROJECT_ID}/traces`;
    }

    return router.query.organizationId
      ? truncatePathBeforeDynamicSegments(router.asPath).replace(
          router.query.organizationId as string,
          orgId,
        )
      : `/organization/${orgId}`;
  };

  return { getProjectPath, getOrgPath };
};
