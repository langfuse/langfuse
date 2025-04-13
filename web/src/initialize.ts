import { env } from "@/src/env.mjs";
import { createUserEmailPassword } from "@/src/features/auth-credentials/lib/credentialsServerUtils";
import { prisma } from "@langfuse/shared/src/db";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import { CloudConfigSchema } from "@langfuse/shared";

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
    await prisma.organizationMembership.upsert({
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
  }
}
