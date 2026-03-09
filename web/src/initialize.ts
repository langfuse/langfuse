import { env } from "@/src/env.mjs";
import { createUserEmailPassword } from "@/src/features/auth-credentials/lib/credentialsServerUtils";
import { prisma } from "@langfuse/shared/src/db";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import { CloudConfigSchema } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";

// Warn if LANGFUSE_INIT_* variables are set but LANGFUSE_INIT_ORG_ID is missing
if (!env.LANGFUSE_INIT_ORG_ID) {
  const setInitVars = [
    env.LANGFUSE_INIT_ORG_NAME && "LANGFUSE_INIT_ORG_NAME",
    env.LANGFUSE_INIT_ORG_CLOUD_PLAN && "LANGFUSE_INIT_ORG_CLOUD_PLAN",
    env.LANGFUSE_INIT_PROJECT_ID && "LANGFUSE_INIT_PROJECT_ID",
    env.LANGFUSE_INIT_PROJECT_NAME && "LANGFUSE_INIT_PROJECT_NAME",
    env.LANGFUSE_INIT_PROJECT_RETENTION && "LANGFUSE_INIT_PROJECT_RETENTION",
    env.LANGFUSE_INIT_PROJECT_PUBLIC_KEY && "LANGFUSE_INIT_PROJECT_PUBLIC_KEY",
    env.LANGFUSE_INIT_PROJECT_SECRET_KEY && "LANGFUSE_INIT_PROJECT_SECRET_KEY",
    env.LANGFUSE_INIT_USER_EMAIL && "LANGFUSE_INIT_USER_EMAIL",
    env.LANGFUSE_INIT_USER_NAME && "LANGFUSE_INIT_USER_NAME",
    env.LANGFUSE_INIT_USER_PASSWORD && "LANGFUSE_INIT_USER_PASSWORD",
  ].filter(Boolean) as string[];

  if (setInitVars.length > 0) {
    logger.warn(
      `[Langfuse Init] LANGFUSE_INIT_ORG_ID is not set but other LANGFUSE_INIT_* variables are configured. ` +
        `The following variables will be ignored: ${setInitVars.join(", ")}. ` +
        `Set LANGFUSE_INIT_ORG_ID to enable initialization.`,
    );
  }
}

// Create Organization
if (env.LANGFUSE_INIT_ORG_ID) {
  const cloudConfig = env.LANGFUSE_INIT_ORG_CLOUD_PLAN
    ? CloudConfigSchema.parse({
        plan: env.LANGFUSE_INIT_ORG_CLOUD_PLAN,
      })
    : undefined;

  const org = await prisma.organization.upsert({
    where: { id: env.LANGFUSE_INIT_ORG_ID },
    update: {},
    create: {
      id: env.LANGFUSE_INIT_ORG_ID,
      name: env.LANGFUSE_INIT_ORG_NAME ?? "Provisioned Org",
      cloudConfig,
    },
  });

  // Warn about partial configurations
  const hasPublicKey = Boolean(env.LANGFUSE_INIT_PROJECT_PUBLIC_KEY);
  const hasSecretKey = Boolean(env.LANGFUSE_INIT_PROJECT_SECRET_KEY);
  const hasEmail = Boolean(env.LANGFUSE_INIT_USER_EMAIL);
  const hasPassword = Boolean(env.LANGFUSE_INIT_USER_PASSWORD);

  // Partial API key config
  if (hasPublicKey !== hasSecretKey) {
    const missingKey = hasPublicKey
      ? "LANGFUSE_INIT_PROJECT_SECRET_KEY"
      : "LANGFUSE_INIT_PROJECT_PUBLIC_KEY";
    logger.warn(
      `[Langfuse Init] Partial API key configuration: ${missingKey} is not set. ` +
        `Both LANGFUSE_INIT_PROJECT_PUBLIC_KEY and LANGFUSE_INIT_PROJECT_SECRET_KEY must be set to create API keys.`,
    );
  }

  // API keys without project ID
  if ((hasPublicKey || hasSecretKey) && !env.LANGFUSE_INIT_PROJECT_ID) {
    logger.warn(
      `[Langfuse Init] LANGFUSE_INIT_PROJECT_ID is not set but API key variables are configured. ` +
        `API keys will not be created. Set LANGFUSE_INIT_PROJECT_ID to enable API key creation.`,
    );
  }

  // Partial user config
  if (hasEmail !== hasPassword) {
    const missingVar = hasEmail
      ? "LANGFUSE_INIT_USER_PASSWORD"
      : "LANGFUSE_INIT_USER_EMAIL";
    logger.warn(
      `[Langfuse Init] Partial user configuration: ${missingVar} is not set. ` +
        `Both LANGFUSE_INIT_USER_EMAIL and LANGFUSE_INIT_USER_PASSWORD must be set to create a user.`,
    );
  }

  // Create Project: Org -> Project
  if (env.LANGFUSE_INIT_PROJECT_ID) {
    let retentionDays: number | null = null;
    const hasRetentionEntitlement = hasEntitlementBasedOnPlan({
      plan: getOrganizationPlanServerSide(),
      entitlement: "data-retention",
    });
    if (env.LANGFUSE_INIT_PROJECT_RETENTION && hasRetentionEntitlement) {
      retentionDays = env.LANGFUSE_INIT_PROJECT_RETENTION;
    }

    await prisma.project.upsert({
      where: { id: env.LANGFUSE_INIT_PROJECT_ID },
      update: {},
      create: {
        id: env.LANGFUSE_INIT_PROJECT_ID,
        name: env.LANGFUSE_INIT_PROJECT_NAME ?? "Provisioned Project",
        orgId: org.id,
        retentionDays,
      },
    });

    // Add API Keys: Project -> API Key
    if (
      env.LANGFUSE_INIT_PROJECT_SECRET_KEY &&
      env.LANGFUSE_INIT_PROJECT_PUBLIC_KEY
    ) {
      const existingApiKey = await prisma.apiKey.findUnique({
        where: { publicKey: env.LANGFUSE_INIT_PROJECT_PUBLIC_KEY },
      });

      // Delete key if project changed
      if (
        existingApiKey &&
        existingApiKey.projectId !== env.LANGFUSE_INIT_PROJECT_ID
      ) {
        await prisma.apiKey.delete({
          where: { publicKey: env.LANGFUSE_INIT_PROJECT_PUBLIC_KEY },
        });
      }

      // Create new key if it doesn't exist or project changed
      if (
        !existingApiKey ||
        existingApiKey.projectId !== env.LANGFUSE_INIT_PROJECT_ID
      ) {
        await createAndAddApiKeysToDb({
          prisma,
          entityId: env.LANGFUSE_INIT_PROJECT_ID,
          note: "Provisioned API Key",
          scope: "PROJECT",
          predefinedKeys: {
            secretKey: env.LANGFUSE_INIT_PROJECT_SECRET_KEY,
            publicKey: env.LANGFUSE_INIT_PROJECT_PUBLIC_KEY,
          },
        });
      }
    }
  }

  // Create User: Org -> User
  if (env.LANGFUSE_INIT_USER_EMAIL && env.LANGFUSE_INIT_USER_PASSWORD) {
    const email = env.LANGFUSE_INIT_USER_EMAIL.toLowerCase();
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    let userId = existingUser?.id;

    // Create user if it doesn't exist yet
    if (!userId) {
      userId = await createUserEmailPassword(
        email,
        env.LANGFUSE_INIT_USER_PASSWORD,
        env.LANGFUSE_INIT_USER_NAME ?? "Provisioned User",
      );
    }

    // Create OrgMembership: Org -> OrgMembership <- User
    const orgMembership = await prisma.organizationMembership.upsert({
      where: {
        orgId_userId: { userId, orgId: org.id },
      },
      update: { role: "OWNER" },
      create: {
        userId,
        orgId: org.id,
        role: "OWNER",
      },
    });

    // On EE plans with rbac-project-roles, createUserEmailPassword ->
    // createProjectMembershipsOnSignup may have already created a ProjectMembership
    // with LANGFUSE_DEFAULT_PROJECT_ROLE (e.g. VIEWER) before the OrgMembership was
    // set to OWNER above. Correct it to OWNER for the init user on the init project.
    if (
      env.LANGFUSE_INIT_PROJECT_ID &&
      hasEntitlementBasedOnPlan({
        plan: getOrganizationPlanServerSide(cloudConfig),
        entitlement: "rbac-project-roles",
      })
    ) {
      await prisma.projectMembership.upsert({
        where: {
          projectId_userId: {
            projectId: env.LANGFUSE_INIT_PROJECT_ID,
            userId,
          },
        },
        update: { role: "OWNER" },
        create: {
          userId,
          orgMembershipId: orgMembership.id,
          projectId: env.LANGFUSE_INIT_PROJECT_ID,
          role: "OWNER",
        },
      });
    }
  }
}
