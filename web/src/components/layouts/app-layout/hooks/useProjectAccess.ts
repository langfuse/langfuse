/**
 * Hook to verify user has access to the current project
 * Client-side check for UX - server-side validation still required in API routes
 */

import { useRouter } from "next/router";
import { useMemo } from "react";
import type { Session } from "next-auth";
import { env } from "@/src/env.mjs";

/**
 * Checks if the current user has access to the project in the URL
 * Handles:
 * - Demo project (always accessible)
 * - Admin users (access to all projects)
 * - Regular users (check project membership)
 *
 * @param session - Current user session
 * @returns Object with hasAccess boolean and projectId
 */
export function useProjectAccess(session: Session | null) {
  const router = useRouter();
  const routerProjectId = router.query.projectId as string | undefined;

  return useMemo(() => {
    // No project in URL - access granted
    if (!routerProjectId) {
      return { hasAccess: true, projectId: undefined };
    }

    // Demo project is always accessible
    if (routerProjectId === env.NEXT_PUBLIC_DEMO_PROJECT_ID) {
      return { hasAccess: true, projectId: routerProjectId };
    }

    // Admin users have access to all projects
    if (session?.user?.admin === true) {
      return { hasAccess: true, projectId: routerProjectId };
    }

    // Check if user's organizations contain this project
    const userProjects =
      session?.user?.organizations
        ?.flatMap((org) => org?.projects?.map((p) => p?.id))
        .filter(Boolean) ?? [];

    const hasAccess = userProjects.includes(routerProjectId);

    return { hasAccess, projectId: routerProjectId };
  }, [routerProjectId, session?.user?.admin, session?.user?.organizations]);
}
