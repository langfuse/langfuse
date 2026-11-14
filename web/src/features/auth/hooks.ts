import { type SessionContextValue, useSession } from "next-auth/react";

import {
  findSessionProject,
  type MaybeSession,
} from "@/src/features/auth/lib/sessionAccessors";

/**
 * Hook to check if the user is authenticated and a member of the project.
 */
export const useIsAuthenticatedAndProjectMember = (
  projectId: string,
): boolean => {
  const session = useSession();
  return isAuthenticatedAndProjectMember(
    session.data,
    session.status,
    projectId,
  );
};

/** isAuthenticatedAndProjectMember reports whether the authenticated session's user is a member of projectId. */
function isAuthenticatedAndProjectMember(
  session: MaybeSession,
  status: SessionContextValue["status"],
  projectId: string,
): boolean {
  if (projectId === "") return false;

  return status === "authenticated" && !!findSessionProject(session, projectId);
}
