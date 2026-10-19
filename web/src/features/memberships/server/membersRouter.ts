import { auditLog } from "@/src/features/audit-logs/server";
import {
  createTRPCRouter,
  type OrgAuthedContext,
  protectedOrganizationProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import * as z from "zod";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  type FilterState,
  optionalPaginationZod,
  Prisma,
  Role,
} from "@langfuse/shared";
import {
  getUserProjectRoles,
  getUserProjectRolesCount,
  escapeSqlLikePattern,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { hasEntitlement } from "@/src/features/entitlements/server";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { ContextResolver } from "@/src/features/auth/policy/contextResolver";
import { allMembersRoutes } from "@/src/features/memberships/server/allMembersRoutes";
import { allInvitesRoutes } from "@/src/features/memberships/server/allInvitesRoutes";
import {
  addOrgMember,
  changeOrgRole,
  createInvitation,
  removeOrgMember,
  removeProjectRole,
  revokeInvitation,
  setProjectRole,
} from "@/src/features/memberships/server/membershipService";
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

/** sessionContext resolves the signed-in caller's authorization context in the procedure's organization. */
function sessionContext(session: OrgAuthedContext["session"]) {
  return contextResolver.resolveUser({
    userId: session.user.id,
    isPlatformAdmin: session.user.admin === true,
    orgId: session.orgId,
  });
}

const contextResolver = new ContextResolver();

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
        projectRole: z.enum(Role).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      /**
       * Add a user to the organization, or invite them when they have no
       * account yet. A user who is already a member can only be given a
       * project role (orgRole NONE). The membership service authorizes the
       * change, enforces the seat limit, audits it and sends the email.
       */
      // check for entitlement (project role)
      if (input.projectId && input.projectRole) {
        const entitled = hasEntitlement({
          entitlement: "rbac-project-roles",
          sessionUser: ctx.session.user,
          orgId: input.orgId,
        });
        if (!entitled)
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Organization does not have the required entitlement to set project roles",
          });
      }

      const authz = await sessionContext(ctx.session);
      const project =
        input.projectId && input.projectRole && input.projectRole !== Role.NONE
          ? { projectId: input.projectId, role: input.projectRole }
          : undefined;
      const notify = {
        inviterEmail: ctx.session.user.email!,
        inviterName: ctx.session.user.name!,
      };

      const user = await ctx.prisma.user.findUnique({
        where: {
          email: input.email.toLowerCase(),
        },
      });

      if (!user) {
        return await createInvitation(authz, {
          orgId: input.orgId,
          email: input.email,
          orgRole: input.orgRole,
          project,
          invitedByUserId: ctx.session.user.id,
          notify,
        });
      }

      const existingOrgMembership =
        await ctx.prisma.organizationMembership.findUnique({
          where: {
            orgId_userId: { orgId: input.orgId, userId: user.id },
          },
        });
      if (!existingOrgMembership) {
        await addOrgMember(authz, {
          orgId: input.orgId,
          userId: user.id,
          role: input.orgRole,
          project,
          notify,
        });
        return;
      }

      // user is already a member and only a project role shall be added
      if (input.orgRole === Role.NONE && project) {
        const existingProjectMembership =
          await ctx.prisma.projectMembership.findUnique({
            where: {
              projectId_userId: {
                projectId: project.projectId,
                userId: user.id,
              },
            },
          });
        if (existingProjectMembership) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "User is already a member of this project",
          });
        }
        await setProjectRole(authz, {
          orgId: input.orgId,
          projectId: project.projectId,
          userId: user.id,
          role: project.role,
        });
        return;
      }
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "User is already a member of this organization",
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
       * Delete an organization membership, used in membership table. Members
       * may always remove themselves.
       */
      const orgMembership = await ctx.prisma.organizationMembership.findFirst({
        where: {
          orgId: input.orgId,
          id: input.orgMembershipId,
        },
      });
      if (!orgMembership)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization membership not found",
        });

      const deleted = await removeOrgMember(await sessionContext(ctx.session), {
        orgId: input.orgId,
        userId: orgMembership.userId,
      });
      if (!deleted)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization membership not found",
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
      return await revokeInvitation(await sessionContext(ctx.session), {
        orgId: input.orgId,
        invitationId: input.inviteId,
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
      const membership = await ctx.prisma.organizationMembership.findFirst({
        where: {
          orgId: input.orgId,
          id: input.orgMembershipId,
        },
      });
      if (!membership) throw new TRPCError({ code: "NOT_FOUND" });

      const { after } = await changeOrgRole(await sessionContext(ctx.session), {
        orgId: input.orgId,
        userId: membership.userId,
        role: input.role,
      });
      return after;
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
        projectRole: z.enum(Role).nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      /**
       * Used by dropdown in membership table to update the project role of a user
       */
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

      // orgMembershipId and userId are independent client inputs, but project
      // access is resolved via orgMembershipId (OrganizationMembership.userId),
      // not this row's userId. A mismatched pair would grant the role to the
      // org membership owner while recording it against a different user, so
      // reject it.
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
      if (orgMembership.userId !== input.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The provided userId does not match the organization membership",
        });
      }

      const authz = await sessionContext(ctx.session);
      // A null or NONE project role removes the project membership.
      if (input.projectRole === null || input.projectRole === Role.NONE) {
        await removeProjectRole(authz, {
          orgId: input.orgId,
          projectId: input.projectId,
          userId: input.userId,
        });
        return {
          userId: input.userId,
        };
      }

      const { after } = await setProjectRole(authz, {
        orgId: input.orgId,
        projectId: input.projectId,
        userId: input.userId,
        role: input.projectRole,
      });
      return after;
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
