import { Role } from "../../db";
import type { PrismaClient } from "../../db";
import { resolveProjectRole } from "../../server/auth/userProjectRoleAuth";

export type InAppAgentResolvedUserProjectAccess = {
  projectRole: Role;
  isAdmin: boolean;
  orgId: string;
};

export async function resolveInAppAgentUserProjectAccess(params: {
  prisma: PrismaClient;
  userId: string;
  projectId: string;
}): Promise<InAppAgentResolvedUserProjectAccess | null> {
  const project = await params.prisma.project.findUnique({
    where: { id: params.projectId },
    select: { orgId: true },
  });

  if (!project) {
    return null;
  }

  const user = await params.prisma.user.findUnique({
    where: { id: params.userId },
    select: { admin: true },
  });

  if (!user) {
    return null;
  }

  if (user.admin) {
    return {
      projectRole: Role.OWNER,
      isAdmin: true,
      orgId: project.orgId,
    };
  }

  const orgMembership = await params.prisma.organizationMembership.findFirst({
    where: { userId: params.userId, orgId: project.orgId },
    include: { ProjectMemberships: true },
  });

  if (!orgMembership) {
    return null;
  }

  const projectRole = resolveProjectRole({
    projectId: params.projectId,
    projectMemberships: orgMembership.ProjectMemberships,
    orgMembershipRole: orgMembership.role,
  });

  if (projectRole === Role.NONE) {
    return null;
  }

  return {
    projectRole,
    isAdmin: false,
    orgId: project.orgId,
  };
}
