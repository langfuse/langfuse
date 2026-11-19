import { createHmac, hkdfSync } from "crypto";
import { prisma } from "../../../db";
import { decrypt } from "../../../encryption";
import { env } from "../../../env";
import { BEDROCK_ROLE_PERMISSION_POLICY } from "../../../interfaces/customLLMProviderConfigSchemas";
import { getStorageRoleCredentialsProvider } from "../storageRoleAuth/storageRoleCredentials";

/** The project or organization that owns a Bedrock LLM connection. */
export type BedrockConnectionOwner =
  | { type: "project"; projectId: string }
  | { type: "organization"; organizationId: string };

/**
 * The external ID a Bedrock LLM connection with IAM role auth shows before it
 * is saved. The form sends a random nonce, so the ID stays the same across
 * requests, but only Langfuse can derive it and it is bound to the owner: no
 * client can make Langfuse send the external ID of another project's or
 * organization's connection. Callers must check the caller's access to the owner.
 */
export function deriveBedrockExternalId(params: {
  owner: BedrockConnectionOwner;
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
  const ownerId =
    params.owner.type === "project"
      ? `project:${params.owner.projectId}`
      : `organization:${params.owner.organizationId}`;
  const digest = createHmac("sha256", key)
    .update(`${ownerId}\0${params.nonce}`)
    .digest("hex");
  return `lf-${digest.slice(0, 32)}`;
}

/**
 * Credentials provider for a Bedrock LLM connection that uses IAM role auth.
 * Sessions are tagged with the project that runs the model, or only with the
 * organization when an organization connection is tested outside a project.
 * They are cached per caller, role and external ID, and refreshed shortly
 * before they expire.
 */
export function createBedrockRoleCredentialProvider(params: {
  caller: { projectId: string } | { organizationId: string };
  roleArn: string;
  /** Encrypted, from the connection row. */
  externalId: string;
}) {
  return async () => {
    const { caller } = params;
    let projectId: string | undefined;
    let orgId: string;
    if ("projectId" in caller) {
      const project = await prisma.project.findUnique({
        where: { id: caller.projectId },
        select: { orgId: true },
      });
      if (!project) {
        throw new Error("Bedrock IAM role auth: project not found.");
      }
      projectId = caller.projectId;
      orgId = project.orgId;
    } else {
      orgId = caller.organizationId;
    }
    const externalId = decrypt(params.externalId);
    return getStorageRoleCredentialsProvider({
      cacheKey: `bedrock:${projectId ?? `org:${orgId}`}:${params.roleArn}:${externalId}`,
      // A project moved to another organization gets new session tags.
      version: orgId,
      roleArn: params.roleArn,
      externalId,
      projectId,
      orgId,
      sessionPolicy: JSON.stringify(BEDROCK_ROLE_PERMISSION_POLICY),
    })();
  };
}
