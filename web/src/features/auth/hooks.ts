import { useSession } from "next-auth/react";

/**
 * Hook to check if the user is authenticated and a member of the project.
 */
export const useIsAuthenticatedAndProjectMember = (projectId: string) => {
  const session = useSession();

  return (
    session.status === "authenticated" &&
    !!session.data?.user?.organizations
      .flatMap((org) => org.projects)
      .find(({ id }) => id === projectId)
  );
};
