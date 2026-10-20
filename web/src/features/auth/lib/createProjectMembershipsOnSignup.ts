import { env } from "@/src/env.mjs";
import { prisma, Role } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { ServerPosthog } from "@/src/features/posthog-analytics/ServerPosthog";
import {
  getOrganizationPlanServerSide,
  hasEntitlementBasedOnPlan,
} from "@/src/features/entitlements/server";
import { shouldAutoEnableV4 } from "@/src/features/events/lib/v4Rollout";
import { getSfdcService } from "@/src/ee/features/sfdc-sync/server";
import { canCreateOrganizations } from "@/src/features/organizations/server";
import { provisionStarterOrganizationForNewUser } from "@/src/features/onboarding/server";
import { projectRoleAccessRights } from "@langfuse/shared";
import { type AdClickIds } from "@/src/features/auth/lib/signupAttribution";
import { systemContext } from "@/src/features/auth/policy/contextResolver";
import {
  acceptInvitations,
  applyOrgMembership,
  applyProjectMembership,
} from "@/src/features/memberships/server/membershipService";

export async function createProjectMembershipsOnSignup(
  user: {
    id: string;
    email: string | null;
    name: string | null;
  },
  options?: {
    userWasJustCreated?: boolean;
    /** Ad-platform click ids, see getAdClickIdsFromRequest */
    adClickIds?: AdClickIds;
  },
) {
  try {
    const isCloudDeployment = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

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
    const signupDefaults = systemContext("signupDefaults");
    if (demoProject !== undefined) {
      await applyOrgMembership(signupDefaults, {
        orgId: demoProject.orgId,
        userId: user.id,
        role: Role.VIEWER,
        keepExistingRole: true,
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

    for (const org of defaultOrgs) {
      await applyOrgMembership(signupDefaults, {
        orgId: org.id,
        userId: user.id,
        role: env.LANGFUSE_DEFAULT_ORG_ROLE ?? "VIEWER",
        keepExistingRole: true,
      });
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
    // to ensure org membership exists.
    const hasProjectRolesEntitlement = hasEntitlementBasedOnPlan({
      plan: getOrganizationPlanServerSide(),
      entitlement: "rbac-project-roles",
    });

    for (const project of defaultProjects) {
      // legacy: a default project outside the default orgs joins its org too
      if (!defaultOrgs.some((org) => org.id === project.orgId)) {
        await applyOrgMembership(signupDefaults, {
          orgId: project.orgId,
          userId: user.id,
          role: env.LANGFUSE_DEFAULT_PROJECT_ROLE ?? "VIEWER",
          keepExistingRole: true,
        });
      }
      if (hasProjectRolesEntitlement) {
        await applyProjectMembership(signupDefaults, {
          orgId: project.orgId,
          projectId: project.id,
          userId: user.id,
          role: env.LANGFUSE_DEFAULT_PROJECT_ROLE ?? "VIEWER",
          keepExistingRole: true,
        });
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

    // for conversion metric tracking in posthog: did a new user sign up?
    // Fires on all production cloud regions, including ones added in the
    // future. STAGING/DEV are excluded to keep test signups out of
    // conversion metrics, and self-hosted deployments never emit this
    // event as the region env is unset. HIPAA still constructs ServerPosthog
    // here; the client is opted out via disable() so the capture is a no-op.
    if (
      isNewUser &&
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
      !["STAGING", "DEV"].includes(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION)
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
            // Google Ads click id for ad conversion attribution
            // ad-platform click ids (gclid, li_fat_id, rdt_cid, twclid)
            // for ad conversion attribution; only resolved ids are present
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

async function processMembershipInvitations(email: string, userId: string) {
  const accepted = await acceptInvitations({ userId, email });

  return accepted.some((invitation) => {
    if (
      invitation.orgId === env.NEXT_PUBLIC_DEMO_ORG_ID ||
      !invitation.projectId
    ) {
      return false;
    }

    const projectRole = invitation.projectRole ?? invitation.orgRole;
    return projectRoleAccessRights[projectRole].includes("project:read");
  });
}
