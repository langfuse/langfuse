import { useSession } from "next-auth/react";

/**
 * Hook to check if the user is authenticated and a member of the project.
 */
export const useIsAuthenticatedAndProjectMember = (
  projectId: string,
): boolean => {
  const session = useSession();

  if (projectId === "") return false;

  const isAdmin = session.data?.user?.admin ?? false;

  return (
    isAdmin ||
    (session.status === "authenticated" &&
      !!session.data?.user?.organizations
        .flatMap((org) => org.projects)
        .find(({ id }) => id === projectId))
  );
};
