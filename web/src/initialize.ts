import { env } from "@/src/env.mjs";
import { createUserEmailPassword } from "@/src/features/auth-credentials/lib/credentialsServerUtils";
import { prisma } from "@langfuse/shared/src/db";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";

// Create Organization
if (env.LANGFUSE_INIT_ORG_ID) {
  const org = await prisma.organization.upsert({
    where: { id: env.LANGFUSE_INIT_ORG_ID },
    update: {},
    create: {
      id: env.LANGFUSE_INIT_ORG_ID,
      name: env.LANGFUSE_INIT_ORG_NAME ?? "Provisioned Org",
    },
  });

  // Create Project: Org -> Project
  if (env.LANGFUSE_INIT_PROJECT_ID) {
    await prisma.project.upsert({
      where: { id: env.LANGFUSE_INIT_PROJECT_ID },
      update: {},
      create: {
        id: env.LANGFUSE_INIT_PROJECT_ID,
        name: env.LANGFUSE_INIT_PROJECT_NAME ?? "Provisioned Project",
        orgId: org.id,
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
          projectId: env.LANGFUSE_INIT_PROJECT_ID,
          note: "Provisioned API Key",
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
    const existingUser = await prisma.user.findUnique({
      where: { email: env.LANGFUSE_INIT_USER_EMAIL.toLowerCase() },
    });

    let userId = existingUser?.id;

    // Create user if it doesn't exist yet
    if (!userId) {
      userId = await createUserEmailPassword(
        env.LANGFUSE_INIT_USER_EMAIL,
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
