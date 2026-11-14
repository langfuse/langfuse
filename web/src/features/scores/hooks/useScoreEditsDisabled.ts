import { useSession } from "next-auth/react";

import {
  findSessionProject,
  type MaybeSession,
} from "@/src/features/auth/lib/sessionAccessors";

/**
 * Whether saved scores in this project are immutable in the UI. Resolved on
 * the server from the deployment allowlist and carried on the session; the
 * score mutations enforce the same rule.
 */
export function useScoreEditsDisabled(projectId: string): boolean {
  const session = useSession();
  return areScoreEditsDisabledForSession(session.data, projectId);
}

/** areScoreEditsDisabledForSession reports whether saved scores in projectId are immutable for the session's user. */
function areScoreEditsDisabledForSession(
  session: MaybeSession,
  projectId: string,
): boolean {
  return findSessionProject(session, projectId)?.scoreEditsDisabled === true;
}
