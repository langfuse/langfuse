import { useSession } from "next-auth/react";

import { findSessionProject } from "@/src/features/auth/lib/sessionAccessors";

/**
 * Hook to check if the user is authenticated and a member of the project.
 */
export const useIsAuthenticatedAndProjectMember = (
  projectId: string,
): boolean => {
  const session = useSession();

  if (projectId === "") return false;

  return (
    session.status === "authenticated" &&
    !!findSessionProject(session.data, projectId)
  );
};
