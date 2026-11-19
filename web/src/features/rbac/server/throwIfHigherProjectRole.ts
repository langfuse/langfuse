import { TRPCError } from "@trpc/server";
import { type PrismaClient, type Role } from "@langfuse/shared";

import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";
import { PROJECT_ROLE_TOO_HIGH_MESSAGE } from "@/src/features/rbac/constants/membershipErrorMessages";

/**
 * Throw if the user tries to set a project role that is higher than their own
 * role determined by MAX(orgRole, projectRole)
 */
export async function throwIfHigherProjectRole({
  orgCtx, // context by protectedOrganizationProcedure
  projectId,
  projectRole,
}: {
  orgCtx: {
    session: {
      orgId: string;
      orgRole: Role;
      user: {
        id: string;
      };
    };
    prisma: PrismaClient;
  };
  projectId: string;
  projectRole: Role;
}) {
  const projectMembership = await orgCtx.prisma.projectMembership.findFirst({
    where: {
      projectId,
      userId: orgCtx.session.user.id,
      organizationMembership: {
        orgId: orgCtx.session.orgId,
      },
    },
  });

  const ownRoleValue: number = projectMembership
    ? Math.max(
        orderedRoles[projectMembership.role],
        orderedRoles[orgCtx.session.orgRole],
      )
    : orderedRoles[orgCtx.session.orgRole];

  if (ownRoleValue < orderedRoles[projectRole]) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: PROJECT_ROLE_TOO_HIGH_MESSAGE,
    });
  }
}
