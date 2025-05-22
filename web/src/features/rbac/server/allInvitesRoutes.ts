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
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

const orgLevelInviteQuery = z.object({
  orgId: z.string(),
  ...paginationZod,
});
const projectLevelInviteQuery = orgLevelInviteQuery.extend({
  projectId: z.string(),
});
async function getInvites(
  prisma: PrismaClient,
  query:
    | z.infer<typeof orgLevelInviteQuery>
    | z.infer<typeof projectLevelInviteQuery>,
  showAllOrgMembers: boolean = true,
) {
  const invitations = await prisma.membershipInvitation.findMany({
    where: {
      orgId: query.orgId,
      // restrict to only invites with role in a project if projectId is set
      ...("projectId" in query && !showAllOrgMembers
        ? {
            OR: [
              {
                orgRole: {
                  not: Role.NONE,
                },
              },
              {
                projectId: query.projectId,
                projectRole: {
                  not: Role.NONE,
                },
              },
            ],
          }
        : {}),
    },
    include: {
      invitedByUser: {
        select: {
          name: true,
          image: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: query.limit,
    skip: query.page * query.limit,
  });

  const totalCount = await prisma.membershipInvitation.count({
    where: {
      orgId: query.orgId,
    },
  });

  return {
    invitations: invitations.map((i) => ({
      ...i,
    })),
    totalCount,
  };
}

export const allInvitesRoutes = {
  allInvitesFromOrg: protectedOrganizationProcedure
    .input(orgLevelInviteQuery)
    .query(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationMembers:read",
      });
      return getInvites(ctx.prisma, input);
    }),
  allInvitesFromProject: protectedProjectProcedure
    .input(projectLevelInviteQuery)
    .query(async ({ input, ctx }) => {
      const orgAccess = hasOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
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
      return getInvites(ctx.prisma, input, orgAccess);
    }),
};
