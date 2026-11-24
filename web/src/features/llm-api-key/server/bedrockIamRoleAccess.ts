import { type Session } from "next-auth";
import { TRPCError } from "@trpc/server";
import { type PrismaClient } from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";
import {
  type BedrockConnectionOwner,
  deriveBedrockExternalId,
} from "@langfuse/shared/src/server/ee/bedrockRoleAuth/bedrockRoleCredentials";
import { getCrossAccountRoleArn } from "@langfuse/shared/src/server/ee/storageRoleAuth/storageRoleCredentials";
import { hasEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { type BedrockIamRoleAccess } from "./llmConnectionService";

type SessionUser = NonNullable<Session["user"]>;

function ownerFilter(owner: BedrockConnectionOwner) {
  return owner.type === "project"
    ? { projectId: owner.projectId }
    : { organizationId: owner.organizationId };
}

// Only the organization's plan grants IAM role auth; Langfuse admins get no bypass.
function canUseBedrockIamRole(params: {
  sessionUser: SessionUser;
  owner: BedrockConnectionOwner;
}) {
  return Boolean(
    hasEntitlement({
      sessionUser: params.sessionUser,
      entitlement: "bedrock-iam-role-auth",
      ...(params.owner.type === "project"
        ? { projectId: params.owner.projectId }
        : { orgId: params.owner.organizationId }),
    }),
  );
}

export function getBedrockIamRoleAccess(params: {
  sessionUser: SessionUser;
  owner: BedrockConnectionOwner;
  externalIdNonce: string | undefined;
}): BedrockIamRoleAccess | undefined {
  return canUseBedrockIamRole(params)
    ? { owner: params.owner, externalIdNonce: params.externalIdNonce }
    : undefined;
}

/** Null when this deployment or the organization does not offer IAM role auth. */
export function getBedrockCrossAccountRoleArn(params: {
  sessionUser: SessionUser;
  owner: BedrockConnectionOwner;
}): string | null {
  return canUseBedrockIamRole(params) ? getCrossAccountRoleArn() : null;
}

/**
 * The external ID to show in the connection form: the one an edited
 * connection was saved with, else one derived from the form's nonce.
 * Callers must check the caller's access to the owner.
 */
export async function getBedrockExternalId(params: {
  prisma: PrismaClient;
  sessionUser: SessionUser;
  owner: BedrockConnectionOwner;
  nonce: string;
  connectionId?: string;
}): Promise<string> {
  if (!getBedrockCrossAccountRoleArn(params)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "IAM role auth for Bedrock is not available here.",
    });
  }
  const derived = () =>
    deriveBedrockExternalId({ owner: params.owner, nonce: params.nonce });
  if (!params.connectionId) return derived();
  const stored = await params.prisma.llmApiKeys.findFirst({
    where: { id: params.connectionId, ...ownerFilter(params.owner) },
    select: { externalId: true },
  });
  return stored?.externalId ? decrypt(stored.externalId) : derived();
}
