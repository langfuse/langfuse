import { type ParsedUrlQuery } from "querystring";

import { env } from "@/src/env.mjs";
import {
  getSessionOrganizations,
  hasSessionUser,
  type MaybeSession,
  type SessionOrganization,
} from "@/src/features/auth/lib/sessionAccessors";

const allowlistedIds = ["[projectId]", "[organizationId]", "[page]"];

/** getSessionNavigationItems lists the projects the session's user can switch to, keeping the current page where the route allows it. */
export function getSessionNavigationItems(
  session: MaybeSession,
  router: NavigationRouter,
) {
  const organizations = getSessionOrganizations(session);

  const allProjectItems = organizations
    .sort(compareOrganizationsDemoLast)
    .flatMap((org) =>
      org.projects.map((proj) => ({
        title: `${org.name} > ${proj.name}`,
        url: getProjectPath(router, proj.id),
        projectId: proj.id,
        active: router.query.projectId === proj.id,
        keywords: ["project", org.name.toLowerCase(), proj.name.toLowerCase()],
      })),
    );

  return {
    allProjectItems,
    isLoading: !hasSessionUser(session),
  };
}

/** compareOrganizationsDemoLast sorts organizations by name with the demo organization at the bottom. */
function compareOrganizationsDemoLast(
  a: SessionOrganization,
  b: SessionOrganization,
) {
  const isDemoA = env.NEXT_PUBLIC_DEMO_ORG_ID === a.id;
  const isDemoB = env.NEXT_PUBLIC_DEMO_ORG_ID === b.id;
  if (isDemoA) return 1;
  if (isDemoB) return -1;
  return a.name.localeCompare(b.name);
}

/** getProjectPath swaps projectId into the current project page's path, or links to the project's home outside a project page. */
function getProjectPath(router: NavigationRouter, projectId: string) {
  if (!router.query.projectId) return `/project/${projectId}`;
  return truncatePathBeforeDynamicSegments(router.route, router.asPath).replace(
    router.query.projectId as string,
    projectId,
  );
}

/** truncatePathBeforeDynamicSegments cuts path at the route's first dynamic segment that is not allowlisted. */
function truncatePathBeforeDynamicSegments(route: string, path: string) {
  const segments = route.split("/");
  const idSegments = segments.filter(
    (segment) => segment.startsWith("[") && segment.endsWith("]"),
  );
  const stopSegment = idSegments.filter((id) => !allowlistedIds.includes(id));
  if (stopSegment.length === 0) return path;
  const stopIndex = segments.indexOf(stopSegment[0]);
  const truncatedPath = path.split("/").slice(0, stopIndex).join("/");
  return truncatedPath;
}

/** NavigationRouter is the part of the Next.js router the navigation items read. */
type NavigationRouter = {
  route: string;
  asPath: string;
  query: ParsedUrlQuery;
};
