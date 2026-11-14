import { useSession } from "next-auth/react";
import { findSessionProject } from "@/src/features/auth/lib/sessionAccessors";

/**
 * Whether saved scores in this project are immutable in the UI. Resolved on
 * the server from the deployment allowlist and carried on the session; the
 * score mutations enforce the same rule.
 */
export function useScoreEditsDisabled(projectId: string): boolean {
  const session = useSession();
  return (
    findSessionProject(session.data, projectId)?.scoreEditsDisabled === true
  );
}
