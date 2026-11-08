import { env } from "@/src/env.mjs";
import { prisma, Role } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { ServerPosthog } from "@/src/features/posthog-analytics/ServerPosthog";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { shouldAutoEnableV4 } from "@/src/features/events/lib/v4Rollout";
import { getSfdcService } from "@/src/ee/features/sfdc-sync/server/sfdcService";
import { canCreateOrganizations } from "@/src/features/organizations/server/canCreateOrganizations";
import { provisionStarterOrganizationForNewUser } from "@/src/features/onboarding/server/onboardingService";
import { isGatewayEnabledForOrganization } from "@/src/features/ai-gateway/server/availability";
import { projectRoleAccessRights } from "@langfuse/shared";
import { type SignupAttribution } from "@/src/features/auth/lib/signupAttribution";

export async function createProjectMembershipsOnSignup(
  user: {
    id: string;
    email: string | null;
    name: string | null;
  },
  options?: SignupAttribution & {
    userWasJustCreated?: boolean;
  },
) {
  try {
    const isCloudDeployment = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

    // no organization membership yet, e.g. on a pre-existing account's first
    // SSO sign-in; the first-sign-in setup below runs for it too
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

    // SFDC lead upsert (never throws; no-op when SfdcService is not
    // configured).
    // Must run BEFORE processMembershipInvitations below so the lead exists
    // when setUserRole events fire for accepted invitations — which is also
    // why the invitation lookup for the lead source runs here, while the
    // invitations still exist.
    if (options?.userWasJustCreated || isNewUser) {
      const sfdcService = getSfdcService();
      if (sfdcService) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { createdAt: true },
        });
        const hasPendingInvitation = user.email
          ? (await prisma.membershipInvitation.findFirst({
              where: { email: user.email.toLowerCase() },
              select: { id: true },
            })) !== null
          : false;
        await sfdcService.upsertUser({
          userId: user.id,
          email: user.email,
          name: user.name,
          createdAt: dbUser?.createdAt ?? new Date(),
          leadSource: hasPendingInvitation
            ? "Langfuse Cloud Invite"
            : "Langfuse Cloud Signup",
        });
      }
    }

    // Invites do not work for users without emails (some future SSO users)
    const joinedRealOrganizationViaInvitation = user.email
      ? await processMembershipInvitations(user.email, user.id)
      : false;

    if (
      isCloudDeployment &&
      !joinedRealOrganizationViaInvitation &&
      canCreateOrganizations(user.email) &&
      (options?.userWasJustCreated || isNewUser)
    ) {
      const starterOrg = await provisionStarterOrganizationForNewUser({
        prisma,
        userId: user.id,
        userName: user.name,
      });

      if (starterOrg) {
        await getSfdcService()?.upsertOrg({
          orgId: starterOrg.organization.id,
          orgName: starterOrg.organization.name,
          createdAt: starterOrg.organization.createdAt,
          plan: "Hobby",
        });
        await getSfdcService()?.setUserRole({
          orgId: starterOrg.organization.id,
          userId: user.id,
          email: user.email,
          role: "OWNER",
        });
      }
    }

    if (isCloudDeployment && (options?.userWasJustCreated || isNewUser)) {
      const userRolloutState = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          createdAt: true,
          v4BetaEnabled: true,
          organizationMemberships: {
            select: {
              organization: {
                select: {
                  id: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });

      if (userRolloutState) {
        const shouldAutoEnableV4ForUser = shouldAutoEnableV4({
          userCreatedAt: userRolloutState.createdAt,
          organizations: userRolloutState.organizationMemberships.map(
            (membership) => ({
              id: membership.organization.id,
              createdAt: membership.organization.createdAt,
            }),
          ),
          excludedOrganizationIds: env.NEXT_PUBLIC_DEMO_ORG_ID
            ? [env.NEXT_PUBLIC_DEMO_ORG_ID]
            : [],
        });
        const shouldInitializeForNewUser =
          options?.userWasJustCreated &&
          !userRolloutState.v4BetaEnabled &&
          shouldAutoEnableV4ForUser;
        const shouldInitializeForFirstOrganization =
          !options?.userWasJustCreated &&
          isNewUser &&
          !userRolloutState.v4BetaEnabled &&
          shouldAutoEnableV4ForUser;

        if (
          shouldInitializeForNewUser ||
          shouldInitializeForFirstOrganization
        ) {
          await prisma.user.update({
            where: { id: user.id },
            data: { v4BetaEnabled: true },
          });
        }
      }
    }

    // Linking a provider to an existing account never sends a second event.
    if (options?.userWasJustCreated && isProductionCloudRegion()) {
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
            provider: options?.provider,
            ...(options?.signupSource ?? {}),
            // ad-platform click ids (gclid, gbraid, wbraid, li_fat_id, rdt_cid,
            // twclid) for ad conversion attribution; only resolved ids are present
            ...(options?.adClickIds ?? {}),
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

/**
 * Every production Cloud region, including ones added later. STAGING and DEV
 * keep test sign-ups out of conversion metrics; self-hosted has no region.
 * HIPAA's ServerPosthog is opted out via disable(), so its captures are no-ops.
 */
export function isProductionCloudRegion() {
  const region = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  return region !== undefined && !["STAGING", "DEV"].includes(region);
}

async function processMembershipInvitations(email: string, userId: string) {
  const invitationsForUser = await prisma.membershipInvitation.findMany({
    where: {
      email: email.toLowerCase(),
    },
  });
  if (invitationsForUser.length === 0) return false;

  const joinedRealOrganizationViaInvitation = invitationsForUser.some(
    (invitation) => {
      if (invitation.orgId === env.NEXT_PUBLIC_DEMO_ORG_ID) return false;
      // Gateway-only members see no projects but belong in the inviting org,
      // where they create their AI Gateway keys, as long as it still has the
      // gateway enabled.
      if (
        invitation.orgRole === Role.AI_GATEWAY &&
        isGatewayEnabledForOrganization(invitation.orgId)
      ) {
        return true;
      }
      if (!invitation.projectId) return false;

      const projectRole = invitation.projectRole ?? invitation.orgRole;
      return projectRoleAccessRights[projectRole].includes("project:read");
    },
  );

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

  // SFDC: link the freshly-created lead to each org as an org-member.
  await Promise.all(
    invitationsForUser.map((invitation) =>
      getSfdcService()?.setUserRole({
        orgId: invitation.orgId,
        userId,
        email,
        role: invitation.orgRole,
      }),
    ),
  );

  return joinedRealOrganizationViaInvitation;
}
