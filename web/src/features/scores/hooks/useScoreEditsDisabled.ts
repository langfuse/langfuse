import { useSession } from "next-auth/react";

/**
 * Whether saved scores in this project are immutable in the UI. Resolved on
 * the server from the deployment allowlist and carried on the session; the
 * score mutations enforce the same rule.
 */
export function useScoreEditsDisabled(projectId: string): boolean {
  const session = useSession();
  return (
    session.data?.user?.organizations
      .flatMap((org) => org.projects)
      .find((project) => project.id === projectId)?.scoreEditsDisabled === true
  );
}
