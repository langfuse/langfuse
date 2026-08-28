import {
  throwIfNoOrganizationAccess,
  hasOrganizationAccess,
} from "@/src/features/rbac/utils/checkOrganizationAccess";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  protectedOrganizationProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod, type PrismaClient, Role } from "@langfuse/shared";
import { formatAuthProviderName } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "@/src/env.mjs";
import {
  EMPTY_ORGANIZATION_FEATURE_PREVIEW_STATES,
  getOrganizationFeaturePreviewStatesByUserId,
  getUserFeaturePreviewManagementCapabilities,
} from "@/src/features/feature-flags/server/organizationFeatureFlags";

const orgLevelMemberQuery = z.object({
  orgId: z.string(),
  searchQuery: z.string().optional(),
  ...paginationZod,
});

const projectLevelMemberQuery = z.object({
  projectId: z.string(),
  searchQuery: z.string().optional(),
  ...paginationZod,
});

async function getMembers(
  prisma: PrismaClient,
  query:
    | z.infer<typeof orgLevelMemberQuery>
    | (z.infer<typeof projectLevelMemberQuery> & { orgId: string }),
  showAllOrgMembers = true,
) {
  // Build common where clause to ensure consistency between findMany and count queries
  const whereClause = {
    orgId: query.orgId,
    // restrict to only members with role in a project if projectId is set and showAllOrgMembers is false
    ...("projectId" in query && !showAllOrgMembers
      ? {
          // either org level role or project level role
          OR: [
            {
              role: {
                not: Role.NONE,
              },
            },
            {
              ProjectMemberships: {
                some: {
                  projectId: query.projectId,
                  role: {
                    not: Role.NONE,
                  },
                },
              },
            },
          ],
        }
      : {}),
    ...(query.searchQuery && {
      user: {
        OR: [
          {
            name: {
              contains: query.searchQuery,
              mode: "insensitive" as const,
            },
          },
          {
            email: {
              contains: query.searchQuery,
              mode: "insensitive" as const,
            },
          },
        ],
      },
    }),
  };

  const orgMemberships = await prisma.organizationMembership.findMany({
    where: whereClause,
    include: {
      user: {
        select: {
          image: true,
          id: true,
          name: true,
          email: true,
          accounts: {
            select: {
              provider: true,
            },
          },
        },
      },
    },
    orderBy: {
      user: {
        email: "asc",
      },
    },
    take: query.limit,
    skip: query.page * query.limit,
  });

  const totalCount = await prisma.organizationMembership.count({
    where: whereClause,
  });

  const projectMemberships =
    "projectId" in query
      ? await prisma.projectMembership.findMany({
          select: {
            userId: true,
            role: true,
          },
          where: {
            orgMembershipId: {
              in: orgMemberships.map((m) => m.id),
            },
            projectId: query.projectId,
          },
        })
      : [];

  return {
    memberships: orgMemberships.map((om) => ({
      ...om,
      user: {
        ...om.user,
        accounts: om.user.accounts.map((account) => ({
          provider: formatAuthProviderName(account.provider),
        })),
      },
      projectRole: projectMemberships.find((pm) => pm.userId === om.userId)
        ?.role,
    })),
    totalCount,
  };
}

export const allMembersRoutes = {
  allFromOrg: protectedOrganizationProcedure
    .input(orgLevelMemberQuery)
    .query(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationMembers:read",
      });
      const isDemoOrganization = env.NEXT_PUBLIC_DEMO_ORG_ID === input.orgId;
      const canManageFeaturePreviews =
        !isDemoOrganization &&
        hasOrganizationAccess({
          session: ctx.session,
          organizationId: input.orgId,
          scope: "organization:update",
        });
      const [result, organization] = await Promise.all([
        getMembers(ctx.prisma, input),
        canManageFeaturePreviews
          ? ctx.prisma.organization.findUnique({
              where: { id: input.orgId },
              select: { featureFlagOrgDefaults: true },
            })
          : Promise.resolve(null),
      ]);
      const userIds = result.memberships.map((membership) => membership.userId);
      const [featurePreviewsByUserId, managementByUserId] =
        canManageFeaturePreviews
          ? await Promise.all([
              getOrganizationFeaturePreviewStatesByUserId({
                prisma: ctx.prisma,
                userIds,
                organizationDefaults:
                  organization?.featureFlagOrgDefaults ?? [],
              }),
              getUserFeaturePreviewManagementCapabilities({
                prisma: ctx.prisma,
                actorUserId: ctx.session.user.id,
                actorIsPlatformAdmin: ctx.session.user.admin === true,
                targetUserIds: userIds,
                demoOrgId: env.NEXT_PUBLIC_DEMO_ORG_ID,
              }),
            ])
          : [new Map(), new Map()];

      return {
        ...result,
        memberships: result.memberships.map((membership) => ({
          ...membership,
          featurePreviews: canManageFeaturePreviews
            ? (featurePreviewsByUserId.get(membership.userId) ??
              EMPTY_ORGANIZATION_FEATURE_PREVIEW_STATES)
            : null,
          featurePreviewManagement: canManageFeaturePreviews
            ? (managementByUserId.get(membership.userId) ?? {
                allowed: false,
              })
            : null,
        })),
      };
    }),
  allFromProject: protectedProjectProcedure
    .input(projectLevelMemberQuery)
    .query(async ({ input, ctx }) => {
      const orgId = ctx.session.orgId;
      const orgAccess = hasOrganizationAccess({
        session: ctx.session,
        organizationId: orgId,
        scope: "organizationMembers:read",
      });

      const projectAccess = hasProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "projectMembers:read",
      });

      if (!orgAccess && !projectAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have the required access rights",
        });
      }

      return getMembers(
        ctx.prisma,
        {
          ...input,
          orgId,
        },
        orgAccess,
      );
    }),
};
