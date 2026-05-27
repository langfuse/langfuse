import { type Prisma, type PrismaClient, Role } from "@langfuse/shared/src/db";
import { resolveProjectRole } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  organizationRoleAccessRights,
  type OrganizationScope,
} from "@/src/features/rbac/constants/organizationAccessRights";
import { projectRoleAccessRights } from "@/src/features/rbac/constants/projectAccessRights";
import { createProjectRoute } from "@/src/features/setup/setupRoutes";

const DEFAULT_STARTER_PROJECT_NAME = "My Project";

const getStarterOrganizationName = (userName?: string | null) => {
  const firstName = userName?.trim().split(/\s+/)[0];

  return firstName ? `${firstName}'s Organization` : "My Organization";
};

const getRealOrganizationMembershipWhereClause = (
  userId: string,
): NonNullable<
  NonNullable<
    Parameters<
      | Prisma.OrganizationMembershipDelegate["findMany"]
      | Prisma.OrganizationMembershipDelegate["count"]
    >[0]
  >["where"]
> => ({
  userId,
  ...(env.NEXT_PUBLIC_DEMO_ORG_ID
    ? { orgId: { not: env.NEXT_PUBLIC_DEMO_ORG_ID } }
    : {}),
});

const getRealOrganizationMemberships = ({
  prisma,
  userId,
}: {
  prisma: Pick<PrismaClient, "organizationMembership">;
  userId: string;
}) =>
  prisma.organizationMembership.findMany({
    where: getRealOrganizationMembershipWhereClause(userId),
    include: {
      ProjectMemberships: true,
      organization: {
        include: {
          projects: {
            where: {
              deletedAt: null,
            },
            orderBy: [
              {
                createdAt: "asc",
              },
              {
                id: "asc",
              },
            ],
          },
        },
      },
    } satisfies Prisma.OrganizationMembershipInclude,
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  });

export type RealOrganizationMembership = Awaited<
  ReturnType<typeof getRealOrganizationMemberships>
>[number];

const getAccessibleProjects = (
  organizationMemberships: RealOrganizationMembership[],
) =>
  organizationMemberships.flatMap((membership) =>
    membership.organization.projects
      .map((project) => ({
        projectId: project.id,
        role: resolveProjectRole({
          projectId: project.id,
          projectMemberships: membership.ProjectMemberships,
          orgMembershipRole: membership.role,
        }),
      }))
      .filter((project) =>
        projectRoleAccessRights[project.role].includes("project:read"),
      ),
  );

const getFirstOrganizationWithProjectCreationAccess = (
  organizationMemberships: RealOrganizationMembership[],
) =>
  organizationMemberships.find((membership) =>
    ((role: Role, scope: OrganizationScope): boolean =>
      organizationRoleAccessRights[role].includes(scope))(
      membership.role,
      "projects:create",
    ),
  );

export const resolveOnboardingRedirectTarget = async ({
  prisma,
  userId,
  userName,
}: {
  prisma: Pick<PrismaClient, "organizationMembership">;
  userId: string;
  userName?: string | null;
}) => {
  const organizationMemberships = await getRealOrganizationMemberships({
    prisma,
    userId,
  });

  const starterOrganizationMembership =
    organizationMemberships.length === 1 ? organizationMemberships[0] : null;

  if (
    starterOrganizationMembership &&
    starterOrganizationMembership.role === Role.OWNER &&
    starterOrganizationMembership.organization.name ===
      getStarterOrganizationName(userName) &&
    starterOrganizationMembership.organization.projects.length === 1
  ) {
    const starterProject =
      starterOrganizationMembership.organization.projects[0];
    const starterProjectRole = resolveProjectRole({
      projectId: starterProject.id,
      projectMemberships: starterOrganizationMembership.ProjectMemberships,
      orgMembershipRole: starterOrganizationMembership.role,
    });

    if (
      starterProject.name === DEFAULT_STARTER_PROJECT_NAME &&
      projectRoleAccessRights[starterProjectRole].includes("project:read")
    ) {
      return {
        redirectTo: `/project/${starterProject.id}/traces`,
      };
    }
  }

  const accessibleProjects = getAccessibleProjects(organizationMemberships);

  const firstProject = accessibleProjects[0];

  if (firstProject) {
    return {
      redirectTo: `/project/${firstProject.projectId}`,
    };
  }

  const firstOrganizationWithProjectCreationAccess =
    getFirstOrganizationWithProjectCreationAccess(organizationMemberships);

  if (firstOrganizationWithProjectCreationAccess) {
    return {
      redirectTo: createProjectRoute(
        firstOrganizationWithProjectCreationAccess.organization.id,
      ),
    };
  }

  const firstOrganization = organizationMemberships[0];

  if (firstOrganization) {
    return {
      redirectTo: `/organization/${firstOrganization.organization.id}`,
    };
  }

  return null;
};

export const provisionStarterOrganizationForNewUser = async ({
  prisma,
  userId,
  userName,
}: {
  prisma: PrismaClient;
  userId: string;
  userName?: string | null;
}) => {
  const createdResources = await prisma.$transaction(async (tx) => {
    // Serialize starter provisioning per user so concurrent first-login flows
    // cannot both observe "no real orgs yet" and create duplicate starters.
    await tx.$queryRaw`
      SELECT id
      FROM users
      WHERE id = ${userId}
      FOR UPDATE
    `;

    const realOrganizationMemberships = await getRealOrganizationMemberships({
      prisma: tx,
      userId,
    });

    const accessibleProjects = getAccessibleProjects(
      realOrganizationMemberships,
    );
    const firstOrganizationWithProjectCreationAccess =
      getFirstOrganizationWithProjectCreationAccess(
        realOrganizationMemberships,
      );

    if (accessibleProjects[0] || firstOrganizationWithProjectCreationAccess) {
      // Do not create a starter org if the user already has access to a project or can create projects in an existing org
      return null;
    }

    const organization = await tx.organization.create({
      data: {
        name: getStarterOrganizationName(userName),
        organizationMemberships: {
          create: {
            userId,
            role: Role.OWNER,
          },
        },
      },
    });

    const project = await tx.project.create({
      data: {
        name: DEFAULT_STARTER_PROJECT_NAME,
        orgId: organization.id,
      },
    });

    return { organization, project };
  });

  if (!createdResources) {
    return null;
  }

  await auditLog(
    {
      resourceType: "organization",
      resourceId: createdResources.organization.id,
      action: "create",
      orgId: createdResources.organization.id,
      orgRole: Role.OWNER,
      userId,
      after: createdResources.organization,
    },
    prisma,
  );

  await auditLog(
    {
      resourceType: "project",
      resourceId: createdResources.project.id,
      action: "create",
      orgId: createdResources.organization.id,
      orgRole: Role.OWNER,
      projectId: createdResources.project.id,
      projectRole: Role.OWNER,
      userId,
      after: createdResources.project,
    },
    prisma,
  );

  return createdResources;
};
