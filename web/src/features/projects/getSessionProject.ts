import {
  findSessionProject,
  findSessionProjectOrganization,
  type MaybeSession,
} from "@/src/features/auth/lib/sessionAccessors";

/** getSessionProject resolves the user's project with projectId and the organization that owns it, or nulls for both when either is missing. */
export function getSessionProject(
  session: MaybeSession,
  projectId: string | null,
) {
  const project = findSessionProject(session, projectId ?? undefined);
  const organization = findSessionProjectOrganization(
    session,
    projectId ?? undefined,
  );

  if (project && organization) {
    return { project, organization };
  }

  return {
    project: null,
    organization: null,
  };
}
