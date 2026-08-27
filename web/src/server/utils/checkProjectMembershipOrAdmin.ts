import { type Session } from "next-auth";

export const isProjectMemberOrAdmin = (
  user: Session["user"] | undefined,
  projectId: string,
): boolean => {
  if (!user) return false;
  if (user.admin === true) return true;

  const sessionProjects = user.organizations.flatMap((org) => org.projects);
  const isProjectMember = sessionProjects.some(
    (project) => project.id === projectId,
  );

  return isProjectMember;
};
