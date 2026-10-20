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
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { ContextResolver } from "@/src/features/auth/policy/contextResolver";
import { allMembersRoutes } from "@/src/features/rbac/server/allMembersRoutes";
import { allInvitesRoutes } from "@/src/features/rbac/server/allInvitesRoutes";
import {
  createInvitation,
  deleteInvitation,
} from "@/src/features/memberships/server/invitationService";
import { inMembershipTransaction } from "@/src/features/memberships/server/membershipTransaction";
import {
  createOrgMembership,
  deleteOrgMembership,
  updateOrgMembership,
} from "@/src/features/memberships/server/orgMembershipService";
import {
  createProjectMembership,
  deleteProjectMembership,
  updateProjectMembership,
} from "@/src/features/memberships/server/projectMembershipService";
import {
  userFeaturePreviewFlags,
  setUserFeaturePreviewWithAuthorization,
} from "@/src/features/feature-flags/server";

const contextResolver = new ContextResolver();

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
        projectRole: z.enum(Role).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const authz = await sessionContext(ctx.session);
      const invitedByUserId = ctx.session.user.id;
      const projectRole = grantedProjectRole(input);
      const user = await ctx.prisma.user.findUnique({
        where: { email: input.email.toLowerCase() },
        select: { id: true },
      });
      return inMembershipTransaction(async (tx) => {
        if (!user) {
          return createInvitation(tx, authz, {
            orgId: input.orgId,
            email: input.email,
            orgRole: input.orgRole,
            projectId: input.projectId,
            projectRole,
            invitedByUserId,
          });
        }
        // an org role of NONE with a project role adds a project-only member
        if (!projectRole || input.orgRole !== Role.NONE) {
          await createOrgMembership(tx, authz, {
            orgId: input.orgId,
            userId: user.id,
            role: input.orgRole,
            invitedByUserId,
          });
        }
        if (projectRole && input.projectId) {
          await createProjectMembership(tx, authz, {
            projectId: input.projectId,
            userId: user.id,
            role: projectRole,
            invitedByUserId,
          });
        }
        return undefined;
      });
    }),
  deleteMembership: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const authz = await sessionContext(ctx.session);
      const deleted = await inMembershipTransaction((tx) =>
        deleteOrgMembership(tx, authz, {
          orgId: input.orgId,
          userId: input.userId,
        }),
      );
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
      const authz = await sessionContext(ctx.session);
      return inMembershipTransaction((tx) =>
        deleteInvitation(tx, authz, {
          orgId: input.orgId,
          invitationId: input.inviteId,
        }),
      );
    }),
  updateOrgMembership: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        userId: z.string(),
        role: z.enum(Role),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const authz = await sessionContext(ctx.session);
      const { after } = await inMembershipTransaction((tx) =>
        updateOrgMembership(tx, authz, {
          orgId: input.orgId,
          userId: input.userId,
          role: input.role,
        }),
      );
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
        userId: z.string(),
        projectId: z.string(),
        projectRole: z.enum(Role).nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const authz = await sessionContext(ctx.session);
      const target = { projectId: input.projectId, userId: input.userId };
      const projectRole = input.projectRole;
      // NONE in this procedure drops the project role, so the org role applies
      if (projectRole === null || projectRole === Role.NONE) {
        await inMembershipTransaction((tx) =>
          deleteProjectMembership(tx, authz, target),
        );
        return { userId: input.userId };
      }
      const { after } = await inMembershipTransaction((tx) =>
        updateProjectMembership(tx, authz, { ...target, role: projectRole }),
      );
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

/** sessionContext resolves the signed-in caller's authorization context in the procedure's organization. */
function sessionContext(session: OrgAuthedContext["session"]) {
  return contextResolver.resolveUser({
    userId: session.user.id,
    isPlatformAdmin: session.user.admin === true,
    orgId: session.orgId,
  });
}

/** grantedProjectRole is the project role to add with a new member, if one was chosen. */
function grantedProjectRole(input: { projectId?: string; projectRole?: Role }) {
  const { projectId, projectRole } = input;
  if (!projectId || !projectRole || projectRole === Role.NONE) return undefined;
  return projectRole;
}
