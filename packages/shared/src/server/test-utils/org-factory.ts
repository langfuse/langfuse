import { v4 } from "uuid";
import { prisma } from "../../db";
import { env } from "../../env";
import { ApiKeyId, ProjectId, SystemRoleId } from "../../features/rbac/types";
import { CloudConfigSchema } from "../../interfaces/cloudConfigSchema";
import { assignRole } from "../../features/rbac/roleAssignmentRepository";
import { createShaHash, getDisplaySecretKey } from "../auth/apiKeys";

export function createBasicAuthHeader(
  username: string,
  password: string,
): string {
  const base64Credentials = Buffer.from(`${username}:${password}`).toString(
    "base64",
  );
  return `Basic ${base64Credentials}`;
}

export type CreateOrgProjectAndApiKeyOptions = {
  projectId?: string;
  plan?: "Team" | "Hobby" | "Core" | "Pro" | "Enterprise";
};

export const createOrgProjectAndApiKey = async (
  props?: CreateOrgProjectAndApiKeyOptions,
) => {
  const projectId = props?.projectId ?? v4();
  const org = await prisma.organization.create({
    data: {
      id: v4(),
      name: v4(),
      cloudConfig: CloudConfigSchema.parse({
        plan: props?.plan ?? "Team",
      }),
    },
  });
  const project = await prisma.project.create({
    data: {
      id: projectId,
      name: v4(),
      orgId: org.id,
    },
  });
  const publicKey = `pk-lf-${v4()}`;
  const secretKey = `sk-lf-${v4()}`;
  const salt = env.SALT;
  if (!salt) {
    throw new Error("SALT is not set");
  }

  const auth = createBasicAuthHeader(publicKey, secretKey);
  const apiKeyRowId = v4();
  await prisma.apiKey.create({
    data: {
      id: apiKeyRowId,
      projectId: projectId,
      publicKey: publicKey,
      // Test fixtures use the modern fast-hash auth path. Avoid bcrypt here as
      // cost-11 hashing adds ~100ms per fixture; keep the legacy hash unique to
      // satisfy the database constraint without affecting authentication.
      hashedSecretKey: `test-hashed-secret-key-${v4()}`,
      fastHashedSecretKey: createShaHash(secretKey, salt),
      displaySecretKey: getDisplaySecretKey(secretKey),
      scope: "PROJECT",
    },
  });

  // Mirror the PROJECT system-role assignment the production create path writes,
  // so the resolver reading policies from assignments sees this fixture key.
  await assignRole(prisma, {
    principalId: ApiKeyId(apiKeyRowId),
    roleId: SystemRoleId("PROJECT"),
    ownerId: ProjectId(projectId),
    tags: [],
  });

  return { projectId, orgId: org.id, publicKey, secretKey, auth, org, project };
};
