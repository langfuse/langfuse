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

const realOrganizationMembershipInclude = {
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
} satisfies Prisma.OrganizationMembershipInclude;

export type RealOrganizationMembership =
  Prisma.OrganizationMembershipGetPayload<{
    include: typeof realOrganizationMembershipInclude;
  }>;

export type OnboardingRedirectTarget = {
  redirectTo: string;
};

const getStarterOrganizationName = (userName?: string | null) => {
  const firstName = userName?.trim().split(/\s+/)[0];

  return firstName ? `${firstName}'s Organization` : "My Organization";
};

const hasOrganizationScope = (role: Role, scope: OrganizationScope): boolean =>
  organizationRoleAccessRights[role].includes(scope);

const getRealOrganizationMembershipWhere = (userId: string) => ({
  userId,
  ...(env.NEXT_PUBLIC_DEMO_ORG_ID
    ? { orgId: { not: env.NEXT_PUBLIC_DEMO_ORG_ID } }
    : {}),
});

export const getRealOrganizationMemberships = async ({
  prisma,
  userId,
}: {
  prisma: Pick<PrismaClient, "organizationMembership">;
  userId: string;
}): Promise<RealOrganizationMembership[]> =>
  prisma.organizationMembership.findMany({
    where: getRealOrganizationMembershipWhere(userId),
    include: realOrganizationMembershipInclude,
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  });

export const resolveOnboardingRedirectTarget = ({
  organizationMemberships,
}: {
  organizationMemberships: RealOrganizationMembership[];
}): OnboardingRedirectTarget | null => {
  const accessibleProjects = organizationMemberships.flatMap((membership) =>
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

  const firstProject = accessibleProjects[0];

  if (firstProject) {
    return {
      redirectTo: `/project/${firstProject.projectId}`,
    };
  }

  const firstCreatableOrganization = organizationMemberships.find(
    (membership) => hasOrganizationScope(membership.role, "projects:create"),
  );

  if (firstCreatableOrganization) {
    return {
      redirectTo: createProjectRoute(
        firstCreatableOrganization.organization.id,
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

    const realOrganizationMembershipCount =
      await tx.organizationMembership.count({
        where: getRealOrganizationMembershipWhere(userId),
      });

    if (realOrganizationMembershipCount > 0) {
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
