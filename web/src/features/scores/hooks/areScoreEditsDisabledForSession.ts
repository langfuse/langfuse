import {
  findSessionProject,
  type MaybeSession,
} from "@/src/features/rbac/new/sessionAccessors";

/** areScoreEditsDisabledForSession reports whether the deployment allowlist carried on the session makes saved scores in projectId immutable. */
export function areScoreEditsDisabledForSession(
  session: MaybeSession,
  projectId: string,
): boolean {
  return findSessionProject(session, projectId)?.scoreEditsDisabled === true;
}
