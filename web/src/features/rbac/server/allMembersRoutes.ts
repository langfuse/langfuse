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

function buildUserSearchFilter(searchQuery: string | undefined | null) {
  if (searchQuery === undefined || searchQuery === null || searchQuery === "") {
    return Prisma.empty;
  }

  const q = searchQuery;
  const searchConditions: Prisma.Sql[] = [];

  searchConditions.push(Prisma.sql`u.name ILIKE ${`%${q}%`}`);
  searchConditions.push(Prisma.sql`u.email ILIKE ${`%${q}%`}`);

  return searchConditions.length > 0
    ? Prisma.sql` AND (${Prisma.join(searchConditions, " OR ")})`
    : Prisma.empty;
}

const orgLevelMemberQuery = z.object({
  orgId: z.string(),
  searchQuery: z.string().optional(),
  ...paginationZod,
});

const projectLevelMemberQuery = orgLevelMemberQuery.extend({
  projectId: z.string(), // optional, view project_role for specific project
});

async function getMembers(
  prisma: PrismaClient,
  query:
    | z.infer<typeof orgLevelMemberQuery>
    | z.infer<typeof projectLevelMemberQuery>,
  showAllOrgMembers: boolean = true,
) {
  const searchFilter = buildUserSearchFilter(query.searchQuery as string | undefined | null);
  
  // Use raw SQL to properly handle the search filter with JOINs
  const isProjectQuery = "projectId" in query;
  
  // Build the base query with search filter
  const baseQuery = Prisma.sql`
    SELECT 
      om.id,
      om."orgId",
      om."userId", 
      om.role,
      om."createdAt",
      om."updatedAt",
      u.id as "user_id",
      u.name as "user_name",
      u.email as "user_email",
      u.image as "user_image"
    FROM "OrganizationMembership" om
    JOIN "User" u ON om."userId" = u.id
    WHERE om."orgId" = ${query.orgId}
    ${searchFilter}
  `;

  // Add project-specific filtering if needed
  const projectFilter = isProjectQuery && !showAllOrgMembers
    ? Prisma.sql` AND (
        om.role != 'NONE' 
        OR EXISTS (
          SELECT 1 FROM "ProjectMembership" pm 
          WHERE pm."orgMembershipId" = om.id 
          AND pm."projectId" = ${(query as z.infer<typeof projectLevelMemberQuery>).projectId}
          AND pm.role != 'NONE'
        )
      )`
    : Prisma.empty;

  const fullQuery = Prisma.sql`
    ${baseQuery}
    ${projectFilter}
    ORDER BY u.email ASC
    LIMIT ${query.limit as number} OFFSET ${(query.page as number) * (query.limit as number)}
  `;

  const orgMemberships = await prisma.$queryRaw<Array<{
    id: string;
    orgId: string;
    userId: string;
    role: Role;
    createdAt: Date;
    updatedAt: Date;
    user_id: string;
    user_name: string | null;
    user_email: string;
    user_image: string | null;
  }>>(fullQuery);

  // Get total count with search filter
  const countQuery = Prisma.sql`
    SELECT COUNT(*)::int as count
    FROM "OrganizationMembership" om
    JOIN "User" u ON om."userId" = u.id
    WHERE om."orgId" = ${query.orgId}
    ${searchFilter}
    ${projectFilter}
  `;

  const countResult = await prisma.$queryRaw<Array<{ count: number }>>(countQuery);
  const totalCount = countResult[0]?.count ?? 0;

  // Get project memberships if needed
  const projectMemberships = isProjectQuery
    ? await prisma.projectMembership.findMany({
        select: {
          userId: true,
          role: true,
        },
        where: {
          orgMembershipId: {
            in: orgMemberships.map((m: any) => m.id),
          },
          projectId: (query as z.infer<typeof projectLevelMemberQuery>).projectId,
        },
      })
    : [];

  return {
    memberships: orgMemberships.map((om: any) => ({
      id: om.id,
      orgId: om.orgId,
      userId: om.userId,
      role: om.role,
      createdAt: om.createdAt,
      updatedAt: om.updatedAt,
      user: {
        id: om.user_id,
        name: om.user_name,
        email: om.user_email,
        image: om.user_image,
      },
      projectRole: projectMemberships.find((pm: any) => pm.userId === om.userId)?.role,
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
      return getMembers(ctx.prisma, input as z.infer<typeof orgLevelMemberQuery>);
    }),
  allFromProject: protectedProjectProcedure
    .input(projectLevelMemberQuery)
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
      return getMembers(ctx.prisma, input as z.infer<typeof projectLevelMemberQuery>, orgAccess);
    }),
};
