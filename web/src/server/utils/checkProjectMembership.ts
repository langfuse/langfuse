import { type Session } from "next-auth";

export const isProjectMember = (
  user: Session["user"] | undefined,
  projectId: string,
): boolean => {
  if (!user) return false;

  const sessionProjects = user.organizations.flatMap((org) => org.projects);
  return sessionProjects.some((project) => project.id === projectId);
};
