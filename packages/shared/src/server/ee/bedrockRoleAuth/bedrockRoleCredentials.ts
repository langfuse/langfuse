import { prisma } from "../../../db";
import { decrypt, encrypt } from "../../../encryption";
import { BEDROCK_ROLE_PERMISSION_POLICY } from "../../../interfaces/customLLMProviderConfigSchemas";
import { generateCustomerRoleExternalId } from "../customerRoleAuth/customerRoleCredentials";
import { getStorageRoleCredentialsProvider } from "../storageRoleAuth/storageRoleCredentials";

/**
 * The project's external ID for Bedrock IAM role auth, generated on first use.
 * Callers must check the caller's access to the project.
 */
export async function getOrCreateBedrockRoleExternalId(projectId: string) {
  // createMany skips the conflict when two requests create it at once.
  await prisma.llmConnectionExternalId.createMany({
    data: [
      { projectId, externalId: encrypt(generateCustomerRoleExternalId()) },
    ],
    skipDuplicates: true,
  });
  const row = await prisma.llmConnectionExternalId.findUniqueOrThrow({
    where: { projectId },
  });
  return decrypt(row.externalId);
}

/**
 * Credentials provider for a Bedrock LLM connection that uses IAM role auth.
 * Sessions are cached per project and role, and refreshed shortly before they
 * expire.
 */
export function createBedrockRoleCredentialProvider({
  projectId,
  roleArn,
}: {
  projectId: string;
  roleArn: string;
}) {
  return async () => {
    const row = await prisma.llmConnectionExternalId.findUnique({
      where: { projectId },
      select: { externalId: true, project: { select: { orgId: true } } },
    });
    if (!row) {
      throw new Error(
        "Bedrock IAM role auth: the project has no external ID. Recreate the LLM connection.",
      );
    }
    return getStorageRoleCredentialsProvider({
      cacheKey: `bedrock:${projectId}:${roleArn}`,
      // orgId: a project moved to another organization gets new session tags.
      version: [row.externalId, row.project.orgId].join("|"),
      roleArn,
      externalId: decrypt(row.externalId),
      projectId,
      orgId: row.project.orgId,
      sessionPolicy: JSON.stringify(BEDROCK_ROLE_PERMISSION_POLICY),
    })();
  };
}
