import { useSession } from "next-auth/react";

import { isAuthenticatedAndProjectMember } from "@/src/features/auth/isAuthenticatedAndProjectMember";

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
