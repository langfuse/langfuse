import {
  findSessionProject,
  type MaybeSession,
  type SessionStatus,
} from "@/src/features/auth/lib/sessionAccessors";

/** isAuthenticatedAndProjectMember is false for an empty projectId or a session that is not authenticated yet. */
export function isAuthenticatedAndProjectMember(
  session: MaybeSession,
  status: SessionStatus,
  projectId: string,
): boolean {
  if (projectId === "") return false;

  return status === "authenticated" && !!findSessionProject(session, projectId);
}
