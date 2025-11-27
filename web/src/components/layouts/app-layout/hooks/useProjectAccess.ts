/**
 * Hook to verify user has access to the current project in the URL
 *
 * IMPORTANT: This hook is designed specifically for the AppLayout component to
 * provide client-side UX protection. It should NOT be used as a security measure
 * elsewhere - server-side validation in API routes is always required.
 *
 * Behavior:
 * - Returns hasAccess=true when no projectId is in URL (allows org pages, public routes, etc.)
 * - Returns hasAccess=true for demo project (public demo functionality)
 * - Returns hasAccess=true for admin users (full access)
 * - Returns hasAccess based on project membership for regular users
 */

import { useRouter } from "next/router";
import { useMemo } from "react";
import type { Session } from "next-auth";
import { env } from "@/src/env.mjs";

/**
 * Checks if the authenticated user has access to the project specified in the URL.
 * Used by AppLayout to show an error page when a user tries to access a project
 * they don't have permission for.
 *
 * Note: When routerProjectId is undefined (no project in URL), returns hasAccess=true
 * because this hook is only meant to block access to specific project routes,
 * not to validate access to non-project routes (org pages, public pages, etc.).
 *
 * @param session - Current user session (must be authenticated for meaningful check)
 * @returns Object with hasAccess boolean and projectId
 */
export function useProjectAccess(session: Session | null) {
  const router = useRouter();
  const routerProjectId = router.query.projectId as string | undefined;

  return useMemo(() => {
    // No project in URL - not a project route, so no project access check needed
    // This allows organization pages, public pages, etc. to render normally
    if (!routerProjectId) {
      return { hasAccess: true, projectId: undefined };
    }

    // Demo project is always accessible for demonstration purposes
    // Note: This is safe because the demo project contains only sample data
    // and API routes still enforce proper authentication for write operations
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
