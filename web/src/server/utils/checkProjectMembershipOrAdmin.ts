import { type User } from "next-auth";

export const isProjectMemberOrAdmin = (
  user: User | null | undefined,
  projectId: string,
): boolean => {
  if (!user) return false;

  const isAdmin = user.admin === true;
  const isProjectMember = user.projects.some(
    (project) => project.id === projectId,
  );

  return isProjectMember || isAdmin;
};
