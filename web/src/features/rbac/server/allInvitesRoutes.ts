import {
  throwIfNoOrganizationAccess,
  hasOrganizationAccess,
} from "@/src/features/rbac/utils/checkOrganizationAccess";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  protectedOrganizationProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod, type PrismaClient, Role, Prisma } from "@langfuse/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

function buildInviteSearchFilter(searchQuery: string | undefined | null) {
  if (searchQuery === undefined || searchQuery === null || searchQuery === "") {
    return Prisma.empty;
  }

  const q = searchQuery;
  return Prisma.sql` AND mi.email ILIKE ${`%${q}%`}`;
}

const orgLevelInviteQuery = z.object({
  orgId: z.string(),
  searchQuery: z.string().optional(),
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
  const searchFilter = buildInviteSearchFilter(query.searchQuery as string | undefined | null);
  const isProjectQuery = "projectId" in query;

  // Build project-specific filtering if needed
  const projectFilter = isProjectQuery && !showAllOrgMembers
    ? Prisma.sql` AND (
        mi."orgRole" != 'NONE' 
        OR (mi."projectId" = ${(query as z.infer<typeof projectLevelInviteQuery>).projectId} AND mi."projectRole" != 'NONE')
      )`
    : Prisma.empty;

  const invitationsQuery = Prisma.sql`
    SELECT 
      mi.id,
      mi."orgId",
      mi.email,
      mi."orgRole",
      mi."projectId",
      mi."projectRole",
      mi."invitedByUserId",
      mi."createdAt",
      mi."updatedAt",
      u.name as "invitedByUser_name",
      u.image as "invitedByUser_image"
    FROM "MembershipInvitation" mi
    LEFT JOIN "User" u ON mi."invitedByUserId" = u.id
    WHERE mi."orgId" = ${query.orgId}
    ${searchFilter}
    ${projectFilter}
    ORDER BY mi."createdAt" DESC
    LIMIT ${query.limit as number} OFFSET ${(query.page as number) * (query.limit as number)}
  `;

  const invitations = await prisma.$queryRaw<Array<{
    id: string;
    orgId: string;
    email: string;
    orgRole: Role;
    projectId: string | null;
    projectRole: Role | null;
    invitedByUserId: string;
    createdAt: Date;
    updatedAt: Date;
    invitedByUser_name: string | null;
    invitedByUser_image: string | null;
  }>>(invitationsQuery);

  // Get total count with search filter
  const countQuery = Prisma.sql`
    SELECT COUNT(*)::int as count
    FROM "MembershipInvitation" mi
    WHERE mi."orgId" = ${query.orgId}
    ${searchFilter}
    ${projectFilter}
  `;

  const countResult = await prisma.$queryRaw<Array<{ count: number }>>(countQuery);
  const totalCount = countResult[0]?.count ?? 0;

  return {
    invitations: invitations.map((i: any) => ({
      id: i.id,
      orgId: i.orgId,
      email: i.email,
      orgRole: i.orgRole,
      projectId: i.projectId,
      projectRole: i.projectRole,
      invitedByUserId: i.invitedByUserId,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      invitedByUser: {
        name: i.invitedByUser_name,
        image: i.invitedByUser_image,
      },
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
      return getInvites(ctx.prisma, input as z.infer<typeof orgLevelInviteQuery>);
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
      return getInvites(ctx.prisma, input as z.infer<typeof projectLevelInviteQuery>, orgAccess);
    }),
};
