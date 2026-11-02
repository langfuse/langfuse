import { auditLog } from "@/src/features/audit-logs/server";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import * as z from "zod";
import {
  hasOrganizationAccess,
  throwIfNoOrganizationAccess,
} from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  type FilterState,
  optionalPaginationZod,
  Prisma,
  Role,
} from "@langfuse/shared";
import {
  sendMembershipInvitationEmail,
  getUserProjectRoles,
  getUserProjectRolesCount,
  escapeSqlLikePattern,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { getSfdcService } from "@/src/ee/features/sfdc-sync/server";
import { hasEntitlement } from "@/src/features/entitlements/server";
import {
  hasProjectAccess,
  throwIfNoProjectAccess,
} from "@/src/features/rbac/utils/checkProjectAccess";
import { allMembersRoutes } from "@/src/features/rbac/server/allMembersRoutes";
import { allInvitesRoutes } from "@/src/features/rbac/server/allInvitesRoutes";
import { requireGatewayEnabledForRole } from "@/src/features/ai-gateway/server/availability";
import {
  deleteUserBoundApiKeys,
  deleteUserBoundApiKeysForRole,
  evictRevokedApiKeys,
} from "@/src/features/ai-gateway/server/apiKey/userBoundApiKeys";
import { inviteOrganizationMember } from "@/src/features/rbac/server/inviteOrganizationMember";
import { throwIfHigherProjectRole } from "@/src/features/rbac/server/throwIfHigherProjectRole";
import { throwIfHigherRole } from "@/src/features/rbac/server/throwIfHigherRole";
import {
  userFeaturePreviewFlags,
  setUserFeaturePreviewWithAuthorization,
} from "@/src/features/feature-flags/server";

function buildUserSearchFilter(searchQuery: string | undefined | null) {
  if (searchQuery === undefined || searchQuery === null || searchQuery === "") {
    return Prisma.empty;
  }

  const pattern = `%${escapeSqlLikePattern(searchQuery)}%`;
  const searchConditions: Prisma.Sql[] = [];

  searchConditions.push(Prisma.sql`u.name ILIKE ${pattern}`);
  searchConditions.push(Prisma.sql`u.email ILIKE ${pattern}`);

  return searchConditions.length > 0
    ? Prisma.sql` AND (${Prisma.join(searchConditions, " OR ")})`
    : Prisma.empty;
}

export const membersRouter = createTRPCRouter({
  ...allMembersRoutes,
  ...allInvitesRoutes,
  create: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        email: z.email(),
        orgRole: z.enum(Role),
        // in case a projectRole should be set for a specific project
        projectId: z.string().optional(),
        projectRole: z.enum(Role).exclude([Role.AI_GATEWAY]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return inviteOrganizationMember({
        ctx,
        input,
        sendInvitationEmail: ({ to, orgName, userExists }) =>
          sendMembershipInvitationEmail({
            inviterEmail: ctx.session.user.email!,
            inviterName: ctx.session.user.name!,
            to,
            orgName,
            orgId: input.orgId,
            userExists,
            env: env,
          }),
      });
    }),
  deleteMembership: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        orgMembershipId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      /**
       * Delete an organization membership, used in membership table
       */
      const orgMembership = await ctx.prisma.organizationMembership.findFirst({
        where: {
          orgId: input.orgId,
          id: input.orgMembershipId,
        },
        include: {
          ProjectMemberships: true,
          // user.email is read by the SFDC sync after delete.
          user: { select: { email: true } },
        },
      });
      if (!orgMembership)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization membership not found",
        });

      // Check if user has access, either by having the correct role, or being the user themselves that is being deleted
      const hasAccess = hasOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationMembers:CUD",
      });
      if (!hasAccess && orgMembership.userId !== ctx.session.user.id)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to delete organization members",
        });

      throwIfHigherRole({
        ownRole: ctx.session.orgRole,
        role: orgMembership.role,
      });

      if (orgMembership.role === Role.OWNER) {
        // check if there are other remaining owners
        const owners = await ctx.prisma.organizationMembership.count({
          where: {
            orgId: input.orgId,
            role: Role.OWNER,
          },
        });
        if (owners === 1) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Cannot remove the last owner of an organization. Assign new owner or delete organization.",
          });
        }
      }

      await auditLog({
        session: ctx.session,
        resourceType: "orgMembership",
        resourceId: orgMembership.id,
        action: "delete",
        before: orgMembership,
      });

      const { deleted, revokedKeys } = await ctx.prisma.$transaction(
        async (tx) => {
          const deleted = await tx.organizationMembership.delete({
            where: {
              id: orgMembership.id,
              orgId: input.orgId,
            },
          });
          const revokedKeys = await deleteUserBoundApiKeys(tx, {
            userId: orgMembership.userId,
            orgId: input.orgId,
          });
          return { deleted, revokedKeys };
        },
      );
      await evictRevokedApiKeys(revokedKeys, { session: ctx.session });

      // SFDC: remove the org-member bridge.
      await getSfdcService()?.removeUser({
        orgId: input.orgId,
        userId: orgMembership.userId,
        email: orgMembership.user?.email,
      });

      return deleted;
    }),
  deleteInvite: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        inviteId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      /**
       * Delete a membership invitation, used in membership_invitation table
       */
      const invitation = await ctx.prisma.membershipInvitation.findFirst({
        where: {
          orgId: input.orgId,
          id: input.inviteId,
        },
      });
      if (!invitation) throw new TRPCError({ code: "NOT_FOUND" });

      if (
        !(
          hasOrganizationAccess({
            session: ctx.session,
            organizationId: input.orgId,
            scope: "organizationMembers:CUD",
          }) ||
          (invitation.projectId &&
            invitation.orgRole === Role.NONE &&
            hasProjectAccess({
              session: ctx.session,
              projectId: invitation.projectId,
              scope: "projectMembers:CUD",
            }))
        )
      )
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "You do not have sufficient rights to delete this invitation.",
        });

      await auditLog({
        session: ctx.session,
        resourceType: "membershipInvitation",
        resourceId: invitation.id,
        action: "delete",
        before: invitation,
      });

      return await ctx.prisma.membershipInvitation.delete({
        where: {
          id: invitation.id,
          orgId: input.orgId,
        },
      });
    }),
  updateOrgMembership: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        orgMembershipId: z.string(),
        role: z.enum(Role),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      /**
       * Used by dropdown in membership table to update the organization role of a user
       */

      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationMembers:CUD",
      });

      const membership = await ctx.prisma.organizationMembership.findFirst({
        where: {
          orgId: input.orgId,
          id: input.orgMembershipId,
        },
        // user.email is read by the SFDC sync after update.
        include: { user: { select: { email: true } } },
      });
      if (!membership) throw new TRPCError({ code: "NOT_FOUND" });

      throwIfHigherRole({
        ownRole: ctx.session.orgRole,
        role: input.role, // new
      });
      requireGatewayEnabledForRole(input.orgId, input.role);
      throwIfHigherRole({
        ownRole: ctx.session.orgRole,
        role: membership.role, // old
      });

      // check if this is the only remaining owner
      const otherOwners = await ctx.prisma.organizationMembership.count({
        where: {
          orgId: input.orgId,
          role: Role.OWNER,
          id: {
            not: membership.id,
          },
        },
      });
      if (otherOwners === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Cannot remove the last owner of an organization. Assign new owner or delete organization.",
        });
      }

      const { updatedMembership, revokedKeys } = await ctx.prisma.$transaction(
        async (tx) => {
          const updatedMembership = await tx.organizationMembership.update({
            where: {
              id: membership.id,
              orgId: input.orgId,
            },
            data: {
              role: input.role,
            },
          });
          const revokedKeys = await deleteUserBoundApiKeysForRole(tx, {
            userId: membership.userId,
            orgId: input.orgId,
            role: input.role,
          });
          return { updatedMembership, revokedKeys };
        },
      );
      await evictRevokedApiKeys(revokedKeys, { session: ctx.session });

      await auditLog({
        session: ctx.session,
        resourceType: "orgMembership",
        resourceId: membership.id,
        action: "update",
        before: membership,
        after: updatedMembership,
      });

      await getSfdcService()?.setUserRole({
        orgId: input.orgId,
        userId: membership.userId,
        email: membership.user?.email,
        role: input.role,
      });

      return updatedMembership;
    }),
  setUserFeaturePreviewEnabled: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        userId: z.string(),
        flag: z.enum(userFeaturePreviewFlags),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:update",
      });
      if (
        env.NEXT_PUBLIC_DEMO_ORG_ID &&
        input.orgId === env.NEXT_PUBLIC_DEMO_ORG_ID
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Feature previews cannot be managed in the demo organization",
        });
      }

      const result = await setUserFeaturePreviewWithAuthorization({
        prisma: ctx.prisma,
        actorUserId: ctx.session.user.id,
        actorIsPlatformAdmin: ctx.session.user.admin === true,
        currentOrgId: input.orgId,
        targetUserId: input.userId,
        flag: input.flag,
        enabled: input.enabled,
        demoOrgId: env.NEXT_PUBLIC_DEMO_ORG_ID,
      });
      if (!result) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "You can only change this user's feature flags if you are an administrator in every organization they belong to.",
        });
      }

      await auditLog({
        session: ctx.session,
        resourceType: "orgMembership",
        resourceId: result.membershipId,
        action: "updateUserFeatureFlag",
        before: {
          flag: input.flag,
          override: result.before,
          scope: "global",
        },
        after: {
          flag: input.flag,
          override: result.after,
          scope: "global",
        },
      });

      return {
        userId: input.userId,
        flag: input.flag,
        enabled: input.enabled,
      };
    }),
  updateProjectRole: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        orgMembershipId: z.string(),
        userId: z.string(),
        projectId: z.string(),
        projectRole: z.enum(Role).exclude([Role.AI_GATEWAY]).nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      /**
       * Used by dropdown in membership table to update the project role of a user
       */
      const hasAccess =
        hasOrganizationAccess({
          session: ctx.session,
          organizationId: input.orgId,
          scope: "organizationMembers:CUD",
        }) ||
        hasProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "projectMembers:CUD",
        });
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have the required access rights",
        });
      }

      // Project-level role assignments require the rbac-project-roles entitlement
      // (Team/Enterprise cloud, Enterprise self-hosted). Mirror the create path.
      // Clearing a role (null / NONE) stays allowed so orgs can clean up after a
      // plan downgrade without needing the paid entitlement.
      if (input.projectRole !== null && input.projectRole !== Role.NONE) {
        const entitled = hasEntitlement({
          entitlement: "rbac-project-roles",
          sessionUser: ctx.session.user,
          orgId: input.orgId,
        });
        if (!entitled) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Organization does not have the required entitlement to set project roles",
          });
        }
      }

      const project = await ctx.prisma.project.findFirst({
        where: {
          id: input.projectId,
          orgId: input.orgId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      // check org membership id, can be trusted after this check
      const orgMembership = await ctx.prisma.organizationMembership.findUnique({
        where: {
          id: input.orgMembershipId,
          orgId: input.orgId,
        },
      });
      if (!orgMembership) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization membership not found",
        });
      }

      // orgMembershipId and userId are independent client inputs, but project
      // access is resolved via orgMembershipId (OrganizationMembership.userId),
      // not this row's userId. A mismatched pair would grant the role to the
      // org membership owner while recording it against a different user in both
      // the ProjectMembership row and the audit log, so reject it.
      if (orgMembership.userId !== input.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The provided userId does not match the organization membership",
        });
      }

      // cannot edit project roles of users with higher org roles
      throwIfHigherRole({
        ownRole: ctx.session.orgRole,
        role: orgMembership.role,
      });

      const projectMembership = await ctx.prisma.projectMembership.findFirst({
        where: {
          projectId: input.projectId,
          userId: input.userId,
          orgMembershipId: input.orgMembershipId,
        },
      });

      // check existing project role if it is higher than own role
      if (projectMembership) {
        await throwIfHigherProjectRole({
          orgCtx: ctx,
          projectId: input.projectId,
          projectRole: projectMembership.role,
        });
      }

      // If the project role is set to null, delete the project membership
      if (input.projectRole === null || input.projectRole === Role.NONE) {
        if (projectMembership) {
          await ctx.prisma.projectMembership.delete({
            where: {
              projectId_userId: {
                projectId: input.projectId,
                userId: input.userId,
              },
              orgMembershipId: input.orgMembershipId,
            },
          });

          await auditLog({
            session: ctx.session,
            resourceType: "projectMembership",
            resourceId: `${input.projectId}--${input.userId}`,
            action: "delete",
            before: projectMembership,
          });
        }
        return {
          userId: input.userId,
        };
      }

      // check new project role if it is higher than own role
      await throwIfHigherProjectRole({
        orgCtx: ctx,
        projectId: input.projectId,
        projectRole: input.projectRole,
      });

      // Create/update
      const updatedProjectMembership =
        await ctx.prisma.projectMembership.upsert({
          where: {
            projectId_userId: {
              projectId: input.projectId,
              userId: input.userId,
            },
            orgMembershipId: input.orgMembershipId,
          },
          update: {
            role: input.projectRole,
          },
          create: {
            projectId: input.projectId,
            userId: input.userId,
            role: input.projectRole,
            orgMembershipId: input.orgMembershipId,
          },
        });

      await auditLog({
        session: ctx.session,
        resourceType: "projectMembership",
        resourceId: `${input.projectId}--${input.userId}`,
        action: projectMembership ? "update" : "create",
        before: projectMembership,
        after: updatedProjectMembership,
      });

      return updatedProjectMembership;
    }),
  byProjectId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        searchQuery: z.string().optional(),
        excludeUserIds: z.array(z.string()).optional(),
        ...optionalPaginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "projectMembers:read",
      });

      const searchFilter = buildUserSearchFilter(input.searchQuery);

      const filterCondition: FilterState =
        input.excludeUserIds && input.excludeUserIds.length > 0
          ? [
              {
                column: "userId",
                operator: "none of",
                value: input.excludeUserIds,
                type: "stringOptions",
              },
            ]
          : [];

      const [users, totalCount] = await Promise.all([
        getUserProjectRoles({
          projectId: input.projectId,
          orgId: ctx.session.orgId,
          searchFilter: searchFilter,
          filterCondition,
          limit: input.limit,
          page: input.page,
          orderBy: Prisma.sql`ORDER BY all_eligible_users.name ASC NULLS LAST, all_eligible_users.email ASC NULLS LAST`,
        }),
        getUserProjectRolesCount({
          projectId: input.projectId,
          orgId: ctx.session.orgId,
          searchFilter: searchFilter,
          filterCondition,
        }),
      ]);

      return {
        users: users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
        })),
        totalCount,
      };
    }),
});
