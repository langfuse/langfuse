import { type User } from "next-auth";

export const isProjectMemberOrAdmin = (
  user: User | null | undefined,
  projectId: string,
): boolean => {
  if (!user) return false;

  const isAdmin = user.admin === true;
  const sessionProjects = user.organizations.flatMap((org) => org.projects);
  const isProjectMember = sessionProjects.some(
    (project) => project.id === projectId,
  );

  return isProjectMember || isAdmin;
};
