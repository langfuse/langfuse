import { Role } from "@prisma/client";
import { prisma } from "../../db";

export async function getProjectAdminEmails(
  projectId: string,
): Promise<string[]> {
  const projectAdmins = await prisma.projectMembership.findMany({
    where: {
      projectId,
      role: {
        in: [Role.OWNER, Role.ADMIN],
      },
    },
    include: {
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  const projectAdminEmails = Array.from(
    new Set(
      projectAdmins
        .map((membership) => membership.user.email)
        .filter((email): email is string => Boolean(email)),
    ),
  );

  return projectAdminEmails;
}
