import { createHmac, hkdfSync } from "crypto";
import { prisma } from "../../../db";
import { decrypt } from "../../../encryption";
import { env } from "../../../env";
import { BEDROCK_ROLE_PERMISSION_POLICY } from "../../../interfaces/customLLMProviderConfigSchemas";
import { getStorageRoleCredentialsProvider } from "../storageRoleAuth/storageRoleCredentials";

/**
 * The external ID a Bedrock LLM connection with IAM role auth shows before it
 * is saved. The form sends a random nonce, so the ID stays the same across
 * requests, but only Langfuse can derive it and it is bound to the project:
 * no client can make Langfuse send another project's external ID.
 * Callers must check the caller's access to the project.
 */
export function deriveBedrockExternalId(params: {
  projectId: string;
  nonce: string;
}) {
  if (!env.ENCRYPTION_KEY) {
    throw new Error("Missing environment variable: `ENCRYPTION_KEY`");
  }
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(env.ENCRYPTION_KEY, "hex"),
      Buffer.alloc(0),
      "langfuse-bedrock-iam-role-external-id",
      32,
    ),
  );
  const digest = createHmac("sha256", key)
    .update(`${params.projectId}\0${params.nonce}`)
    .digest("hex");
  return `lf-${digest.slice(0, 32)}`;
}

/**
 * Credentials provider for a Bedrock LLM connection that uses IAM role auth.
 * Sessions are cached per connection role and external ID, and refreshed
 * shortly before they expire.
 */
export function createBedrockRoleCredentialProvider(params: {
  projectId: string;
  roleArn: string;
  /** Encrypted, from the connection row. */
  externalId: string;
}) {
  return async () => {
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { orgId: true },
    });
    if (!project) {
      throw new Error("Bedrock IAM role auth: project not found.");
    }
    const externalId = decrypt(params.externalId);
    return getStorageRoleCredentialsProvider({
      cacheKey: `bedrock:${params.projectId}:${params.roleArn}:${externalId}`,
      // A project moved to another organization gets new session tags.
      version: project.orgId,
      roleArn: params.roleArn,
      externalId,
      projectId: params.projectId,
      orgId: project.orgId,
      sessionPolicy: JSON.stringify(BEDROCK_ROLE_PERMISSION_POLICY),
    })();
  };
}
