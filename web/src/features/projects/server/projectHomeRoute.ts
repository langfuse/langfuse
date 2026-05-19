import type { Session } from "next-auth";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { resolveProjectRole } from "@langfuse/shared/src/server";
import { projectRoleAccessRights } from "@/src/features/rbac/constants/projectAccessRights";
import { sendAdminAccessWebhook } from "@/src/server/adminAccessWebhook";

type ProjectHomeRouteResolution =
  | {
      kind: "redirect-sign-in";
      destination: string;
    }
  | {
      kind: "not-found";
    }
  | {
      kind: "render";
    }
  | {
      kind: "redirect-traces";
      destination: string;
    };

const getProjectHomeDestination = (projectId: string) =>
  `/project/${projectId}`;

const getProjectTracingDestination = (projectId: string) =>
  `${getProjectHomeDestination(projectId)}/traces`;

const getProjectSignInDestination = (projectId: string) =>
  `/auth/sign-in?targetPath=${encodeURIComponent(
    getProjectHomeDestination(projectId),
  )}`;

export const resolveProjectHomeRoute = async ({
  prisma,
  session,
  projectId,
}: {
  prisma: Pick<PrismaClient, "project">;
  session: Session | null;
  projectId: string;
}): Promise<ProjectHomeRouteResolution> => {
  if (!session?.user) {
    return {
      kind: "redirect-sign-in",
      destination: getProjectSignInDestination(projectId),
    };
  }

  const sessionOrganization = session.user.organizations.find((organization) =>
    organization.projects.some((project) => project.id === projectId),
  );

  const sessionProject = sessionOrganization?.projects.find(
    (project) => project.id === projectId,
  );

  if (sessionProject && sessionOrganization) {
    const persistedProject = await prisma.project.findFirst({
      where: {
        id: projectId,
        orgId: sessionOrganization.id,
        deletedAt: null,
      },
      select: {
        hasTraces: true,
      },
    });

    if (!persistedProject) {
      return {
        kind: "not-found",
      };
    }

    if (session.user.admin === true) {
      await sendAdminAccessWebhook({
        email: session.user.email,
        projectId,
        orgId: sessionOrganization.id,
      });
    }

    return sessionProject.hasTraces || persistedProject.hasTraces
      ? { kind: "render" }
      : {
          kind: "redirect-traces",
          destination: getProjectTracingDestination(projectId),
        };
  }

  if (session.user.admin === true) {
    const adminProject = await prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
      },
      select: {
        orgId: true,
        hasTraces: true,
      },
    });

    if (!adminProject) {
      return {
        kind: "not-found",
      };
    }

    await sendAdminAccessWebhook({
      email: session.user.email,
      projectId,
      orgId: adminProject.orgId,
    });

    return adminProject.hasTraces
      ? { kind: "render" }
      : {
          kind: "redirect-traces",
          destination: getProjectTracingDestination(projectId),
        };
  }

  const membershipProject = await prisma.project.findFirst({
    where: {
      id: projectId,
      deletedAt: null,
      organization: {
        organizationMemberships: {
          some: {
            userId: session.user.id,
          },
        },
      },
    },
    select: {
      hasTraces: true,
      projectMembers: {
        where: {
          userId: session.user.id,
        },
        select: {
          projectId: true,
          role: true,
        },
      },
      organization: {
        select: {
          organizationMemberships: {
            where: {
              userId: session.user.id,
            },
            select: {
              role: true,
            },
            take: 1,
          },
        },
      },
    },
  });

  const organizationMembership =
    membershipProject?.organization.organizationMemberships[0];

  if (!membershipProject || !organizationMembership) {
    return {
      kind: "not-found",
    };
  }

  const projectRole = resolveProjectRole({
    projectId,
    projectMemberships: membershipProject.projectMembers,
    orgMembershipRole: organizationMembership.role,
  });

  if (!projectRoleAccessRights[projectRole].includes("project:read")) {
    return {
      kind: "not-found",
    };
  }

  return membershipProject.hasTraces
    ? { kind: "render" }
    : {
        kind: "redirect-traces",
        destination: getProjectTracingDestination(projectId),
      };
};
