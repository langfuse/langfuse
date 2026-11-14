import {
  findSessionProject,
  type MaybeSession,
} from "@/src/features/auth/lib/sessionAccessors";

/** isProjectMember reports whether the session user can open projectId. */
export const isProjectMember = (
  session: MaybeSession,
  projectId: string,
): boolean => findSessionProject(session, projectId) !== undefined;
