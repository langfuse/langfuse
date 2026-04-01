import { env } from "@/src/env.mjs";
import { prisma, Role } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { ServerPosthog } from "@/src/features/posthog-analytics/ServerPosthog";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";

export async function createProjectMembershipsOnSignup(user: {
  id: string;
  email: string | null;
}) {
  try {
    // in no case do we want to send duplicate sign up events to posthog
    const isNewUser = !(await prisma.organizationMembership.findFirst({
      where: { userId: user.id },
      select: { id: true },
    }));

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
      await prisma.organizationMembership.upsert({
        where: {
          orgId_userId: { orgId: demoProject.orgId, userId: user.id },
        },
        update: {}, // No-op: preserve existing role
        create: {
          userId: user.id,
          orgId: demoProject.orgId,
          role: Role.VIEWER,
        },
      });
    }

    // self-hosted: LANGFUSE_DEFAULT_ORG_ID (supports comma-separated list of org IDs)
    const defaultOrgIds = env.LANGFUSE_DEFAULT_ORG_ID ?? [];
    const defaultOrgs =
      defaultOrgIds.length > 0
        ? await prisma.organization.findMany({
            where: {
              id: { in: defaultOrgIds },
            },
          })
        : [];

    // Create org memberships for all default orgs, store mapping of orgId -> membership
    const orgMembershipMap = new Map<
      string,
      { id: string; orgId: string; userId: string }
    >();
    for (const org of defaultOrgs) {
      const membership = await prisma.organizationMembership.upsert({
        where: {
          orgId_userId: { orgId: org.id, userId: user.id },
        },
        update: {}, // No-op: preserve existing role
        create: {
          orgId: org.id,
          userId: user.id,
          role: env.LANGFUSE_DEFAULT_ORG_ROLE ?? "VIEWER",
        },
      });
      orgMembershipMap.set(org.id, membership);
    }

    // self-hosted: LANGFUSE_DEFAULT_PROJECT_ID (supports comma-separated list of project IDs)
    const defaultProjectIds = env.LANGFUSE_DEFAULT_PROJECT_ID ?? [];
    const defaultProjects =
      defaultProjectIds.length > 0
        ? await prisma.project.findMany({
            where: {
              id: { in: defaultProjectIds },
            },
          })
        : [];

    // Project-level role assignments require the rbac-project-roles entitlement.
    // Without it, users inherit their org role for all projects, so we only need
    // to ensure org membership exists (handled above and in path 2 below).
    const hasProjectRolesEntitlement = hasEntitlementBasedOnPlan({
      plan: getOrganizationPlanServerSide(),
      entitlement: "rbac-project-roles",
    });

    for (const project of defaultProjects) {
      const existingOrgMembership = orgMembershipMap.get(project.orgId);
      if (existingOrgMembership) {
        // (1) project's org is in the default org list -> create project membership if entitled
        if (hasProjectRolesEntitlement) {
          await prisma.projectMembership.upsert({
            where: {
              projectId_userId: {
                projectId: project.id,
                userId: user.id,
              },
            },
            update: {}, // No-op: preserve existing role
            create: {
              userId: user.id,
              orgMembershipId: existingOrgMembership.id,
              projectId: project.id,
              role: env.LANGFUSE_DEFAULT_PROJECT_ROLE ?? "VIEWER",
            },
          });
        }
      } else {
        // (2) project's org is NOT in the default org list (legacy behavior) -> create org membership for the project's org first
        const orgMembership = await prisma.organizationMembership.upsert({
          where: {
            orgId_userId: { orgId: project.orgId, userId: user.id },
          },
          update: {}, // No-op: preserve existing role
          create: {
            orgId: project.orgId,
            userId: user.id,
            role: env.LANGFUSE_DEFAULT_PROJECT_ROLE ?? "VIEWER",
          },
        });
        // Add to map in case multiple projects belong to the same org
        orgMembershipMap.set(project.orgId, orgMembership);

        if (hasProjectRolesEntitlement) {
          await prisma.projectMembership.upsert({
            where: {
              projectId_userId: {
                projectId: project.id,
                userId: user.id,
              },
            },
            update: {}, // No-op: preserve existing role
            create: {
              userId: user.id,
              orgMembershipId: orgMembership.id,
              projectId: project.id,
              role: env.LANGFUSE_DEFAULT_PROJECT_ROLE ?? "VIEWER",
            },
          });
        }
      }
    }

    // Invites do not work for users without emails (some future SSO users)
    if (user.email) await processMembershipInvitations(user.email, user.id);

    // for conversion metric tracking in posthog: did a new user sign up?
    if (
      isNewUser &&
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
      ["EU", "US"].includes(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION)
    ) {
      try {
        const posthog = new ServerPosthog();
        posthog.capture({
          distinctId: user.id,
          event: "cloud_signup_complete",
          properties: {
            cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
            hasDemoAccess: demoProject !== undefined,
            hasDefaultOrg: defaultOrgs.length > 0,
            hasDefaultProject: defaultProjects.length > 0,
          },
        });
        await posthog.shutdown();
      } catch {
        // analytics tracking failure is not critical, just fail
      }
    }
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
