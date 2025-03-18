import { env } from "@/src/env.mjs";
import { prisma, Role } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

export async function createProjectMembershipsOnSignup(user: {
  id: string;
  email: string | null;
}) {
  try {
    // Langfuse Cloud: provide view-only access to the demo project, none access to the demo org
    const demoProject =
      env.NEXT_PUBLIC_DEMO_ORG_ID && env.NEXT_PUBLIC_DEMO_PROJECT_ID
        ? ((await prisma.project.findUnique({
            where: {
              orgId: env.NEXT_PUBLIC_DEMO_ORG_ID,
              id: env.NEXT_PUBLIC_DEMO_PROJECT_ID,
            },
          })) ?? undefined)
        : undefined;
    if (demoProject !== undefined) {
      await prisma.organizationMembership.create({
        data: {
          userId: user.id,
          orgId: demoProject.orgId,
          role: Role.VIEWER,
        },
      });
    }

    // self-hosted: LANGFUSE_DEFAULT_ORG_ID
    const defaultOrg = env.LANGFUSE_DEFAULT_ORG_ID
      ? ((await prisma.organization.findUnique({
          where: {
            id: env.LANGFUSE_DEFAULT_ORG_ID,
          },
        })) ?? undefined)
      : undefined;
    const defaultOrgMembership =
      defaultOrg !== undefined
        ? await prisma.organizationMembership.create({
            data: {
              orgId: defaultOrg.id,
              userId: user.id,
              role: env.LANGFUSE_DEFAULT_ORG_ROLE ?? "VIEWER",
            },
          })
        : undefined;

    // self-hosted: LANGFUSE_DEFAULT_PROJECT_ID
    const defaultProject = env.LANGFUSE_DEFAULT_PROJECT_ID
      ? ((await prisma.project.findUnique({
          where: {
            id: env.LANGFUSE_DEFAULT_PROJECT_ID,
          },
        })) ?? undefined)
      : undefined;
    if (defaultProject !== undefined) {
      if (defaultOrgMembership) {
        // (1) used together with LANGFUSE_DEFAULT_ORG_ID -> create project role for the project within the org, do nothing if the project is not in the org
        if (defaultProject.orgId === defaultOrgMembership.orgId) {
          await prisma.projectMembership.create({
            data: {
              userId: user.id,
              orgMembershipId: defaultOrgMembership.id,
              projectId: defaultProject.id,
              role: env.LANGFUSE_DEFAULT_PROJECT_ROLE ?? "VIEWER",
            },
          });
        }
      } else {
        // (2) used without LANGFUSE_DEFAULT_ORG_ID (legacy) -> create org membership for the project's org
        await prisma.organizationMembership.create({
          data: {
            orgId: defaultProject.orgId,
            userId: user.id,
            role: env.LANGFUSE_DEFAULT_PROJECT_ROLE ?? "VIEWER",
          },
        });
      }
    }

    // Invites do not work for users without emails (some future SSO users)
    if (user.email) await processMembershipInvitations(user.email, user.id);
  } catch (e) {
    logger.error("Error assigning project access to new user", e);
  }
}

async function processMembershipInvitations(email: string, userId: string) {
  const invitationsForUser = await prisma.membershipInvitation.findMany({
    where: {
      email: email.toLowerCase(),
    },
  });
  if (invitationsForUser.length === 0) return;

  // Map to individual payloads instead of using createMany as we can thereby use nested writes for ProjectMemberships
  const createOrgMembershipData = invitationsForUser.map((invitation) => ({
    userId: userId,
    orgId: invitation.orgId,
    role: invitation.orgRole,
    ...(invitation.projectId && invitation.projectRole
      ? {
          ProjectMemberships: {
            create: {
              userId: userId,
              projectId: invitation.projectId,
              role: invitation.projectRole,
            },
          },
        }
      : {}),
  }));

  const createOrgMembershipsPromises = createOrgMembershipData.map(
    (inviteData) => prisma.organizationMembership.create({ data: inviteData }),
  );

  await prisma.$transaction([
    ...createOrgMembershipsPromises,
    prisma.membershipInvitation.deleteMany({
      where: {
        id: {
          in: invitationsForUser.map((invitation) => invitation.id),
        },
        email: email.toLowerCase(),
      },
    }),
  ]);
}
