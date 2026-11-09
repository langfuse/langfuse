import { TRPCError } from "@trpc/server";
import {
  type PrismaClient,
  type ProjectScope,
  type Role,
  projectRoleAccessRights,
} from "@langfuse/shared";

import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";

/**
 * Throw if the user tries to set a project role that is higher than their own
 * role determined by MAX(orgRole, projectRole), unless their group scopes cover it.
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
        organizations: {
          id: string;
          projects: { id: string; scopes?: ProjectScope[] }[];
        }[];
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

  const ownScopes = orgCtx.session.user.organizations
    .find((org) => org.id === orgCtx.session.orgId)
    ?.projects.find((project) => project.id === projectId)?.scopes;
  const coveredByGroups =
    ownScopes !== undefined &&
    projectRoleAccessRights[projectRole].every((scope) =>
      ownScopes.includes(scope),
    );

  if (ownRoleValue < orderedRoles[projectRole] && !coveredByGroups) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You cannot grant/edit a role higher than your own",
    });
  }
}
