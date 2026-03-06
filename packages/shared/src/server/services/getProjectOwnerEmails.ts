import { prisma, Role } from "../../db";

export async function getProjectOwnerEmails(
  projectId: string,
): Promise<string[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { orgId: true },
  });
  if (!project) return [];

  const projectOwners = await prisma.projectMembership.findMany({
    where: {
      projectId,
      role: Role.OWNER,
    },
    include: {
      user: { select: { email: true } },
    },
  });
  const emails = projectOwners
    .map((m) => m.user.email)
    .filter((email): email is string => !!email);
  if (emails.length > 0) return emails;

  const orgOwners = await prisma.organizationMembership.findMany({
    where: {
      orgId: project.orgId,
      role: Role.OWNER,
    },
    include: {
      user: { select: { email: true } },
    },
  });
  return orgOwners
    .map((m) => m.user.email)
    .filter((email): email is string => !!email);
}
