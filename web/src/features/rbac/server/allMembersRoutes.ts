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
import { z } from "zod/v4";

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
  showAllOrgMembers: boolean = true,
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
      return getMembers(ctx.prisma, input);
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
