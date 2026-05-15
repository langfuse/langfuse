import { type Prisma, type PrismaClient, Role } from "@langfuse/shared/src/db";
import { resolveProjectRole } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  buildStarterOrganizationMetadata,
  buildStarterProjectMetadata,
  shouldShowStarterProjectInvitePrompt,
} from "@/src/features/onboarding/lib/starterProjectMetadata";
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
  organizationId: string | null;
  projectId: string | null;
  redirectTo: string;
  showStarterProjectInvitePrompt: boolean;
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
  userId,
}: {
  organizationMemberships: RealOrganizationMembership[];
  userId: string;
}): OnboardingRedirectTarget | null => {
  const accessibleProjects = organizationMemberships.flatMap((membership) =>
    membership.organization.projects
      .map((project) => ({
        organizationId: membership.organization.id,
        projectId: project.id,
        metadata: project.metadata,
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

  const starterProject = accessibleProjects.find((project) =>
    shouldShowStarterProjectInvitePrompt({
      metadata: project.metadata,
      userId,
    }),
  );

  if (starterProject) {
    return {
      organizationId: starterProject.organizationId,
      projectId: starterProject.projectId,
      redirectTo: `/project/${starterProject.projectId}/traces`,
      showStarterProjectInvitePrompt: true,
    };
  }

  const firstProject = accessibleProjects[0];

  if (firstProject) {
    return {
      organizationId: firstProject.organizationId,
      projectId: firstProject.projectId,
      redirectTo: `/project/${firstProject.projectId}`,
      showStarterProjectInvitePrompt: false,
    };
  }

  const firstCreatableOrganization = organizationMemberships.find(
    (membership) => hasOrganizationScope(membership.role, "projects:create"),
  );

  if (firstCreatableOrganization) {
    return {
      organizationId: firstCreatableOrganization.organization.id,
      projectId: null,
      redirectTo: createProjectRoute(
        firstCreatableOrganization.organization.id,
      ),
      showStarterProjectInvitePrompt: false,
    };
  }

  const firstOrganization = organizationMemberships[0];

  if (firstOrganization) {
    return {
      organizationId: firstOrganization.organization.id,
      projectId: null,
      redirectTo: `/organization/${firstOrganization.organization.id}`,
      showStarterProjectInvitePrompt: false,
    };
  }

  return null;
};

export const provisionStarterOrganizationForNewUser = async ({
  prisma,
  userId,
  userName,
  canCreateOrganizations,
}: {
  prisma: PrismaClient;
  userId: string;
  userName?: string | null;
  canCreateOrganizations: boolean;
}) => {
  if (!canCreateOrganizations) {
    return null;
  }

  const createdResources = await prisma.$transaction(async (tx) => {
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
        metadata: buildStarterOrganizationMetadata({
          userId,
        }),
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
        metadata: buildStarterProjectMetadata({
          userId,
        }),
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
