import { randomUUID } from "crypto";
import type { Cluster, Redis } from "ioredis";
import { Prisma, type PrismaClient } from "../../db";
import { InvalidRequestError } from "../../errors";
import type { ProjectAction } from "../../features/rbac/systemRoleAccessRights";
import { ProjectId, SystemRoleId, UserId } from "../../features/rbac/types";
import { createApiKey, deleteApiKeyFromDb } from "../../server/auth/apiKeys";
import { SANDBOX_PUBLIC_KEY_PREFIX } from "../constants";

/**
 * Langfuse API keys for scripts the in-app agent runs in its sandbox.
 *
 * One key per approved script. The worker mints it outside the agent loop,
 * hands it to the guest as process environment, and deletes the row when the
 * script completes, fails, or is cancelled. The guest can read and copy the
 * key while it is valid; deleting the row is what ends its use.
 */

const SANDBOX_KEY_NAME = "In-app agent sandbox script";

/** Upper bound on a sandbox key's lifetime, whatever the script deadline. */
export const SANDBOX_KEY_MAX_TTL_MS = 15 * 60 * 1000;

/**
 * Actions a sandbox key never carries, even when the user's role allows them:
 * member management, LLM connection writes, API-key CRUD, project
 * update/delete, and integrations.
 */
export const SANDBOX_KEY_DENYLIST: readonly ProjectAction[] = [
  "projectMembers:CUD",
  "projectMembers:manageOwnership",
  "llmApiKeys:create",
  "llmApiKeys:update",
  "llmApiKeys:delete",
  "apiKeys:read",
  "apiKeys:CUD",
  "project:update",
  "project:delete",
  "integrations:CRUD",
];

/** Scope requested for an SDK script before the user narrows it at approval. */
export const DEFAULT_SANDBOX_SDK_SCOPE: readonly ProjectAction[] = [
  "project:read",
  "traces:read",
  "traces:create",
  "datasets:read",
  "datasets:CUD",
  "prompts:read",
  "prompts:CUD",
  "scores:read",
  "scores:save",
  "experiments:read",
  "playground:execute",
];

export type SandboxKeyGrant = {
  userId: string;
  projectId: string;
  /** Actions the user approved for this script. */
  scope: readonly ProjectAction[];
  expiresAt: Date;
};

export type SandboxKey = {
  id: string;
  publicKey: string;
  secretKey: string;
  expiresAt: Date;
};

/**
 * Mints the key for one approved script.
 *
 * Contract this function stands for: a project key bound to `userId` whose
 * effective permissions are evaluated on every request as
 * `(user's current project role ∩ grant.scope) − SANDBOX_KEY_DENYLIST`, and
 * which stops working when the user leaves the organization.
 */
export async function mintUserBoundSandboxKey(
  prisma: PrismaClient,
  grant: SandboxKeyGrant,
): Promise<SandboxKey> {
  const denied = grant.scope.filter((action) =>
    SANDBOX_KEY_DENYLIST.includes(action),
  );
  if (denied.length > 0) {
    throw new InvalidRequestError(
      `Sandbox keys cannot carry: ${denied.join(", ")}`,
    );
  }

  const ttlMs = grant.expiresAt.getTime() - Date.now();
  if (ttlMs <= 0 || ttlMs > SANDBOX_KEY_MAX_TTL_MS) {
    throw new InvalidRequestError(
      `Sandbox key expiry must be within ${SANDBOX_KEY_MAX_TTL_MS / 60_000} minutes`,
    );
  }

  // STUB — replace with the user-bound API key primitive before shipping.
  // Today the row only records `createdByUserId`; authorization still comes
  // from LEGACY_PROJECT_API_KEY, so this key is NOT limited to the user's role
  // or to `grant.scope`, and that role still allows `llmApiKeys:*` and
  // `integrations:CRUD`. The denylist above is only checked against the
  // requested scope. The approval gate in the worker denies every script until
  // this is replaced, so nothing reaches this call in a deployed build.
  const key = await createApiKey(prisma, {
    owner: ProjectId(grant.projectId),
    role: SystemRoleId("LEGACY_PROJECT_API_KEY"),
    createdBy: UserId(grant.userId),
    name: SANDBOX_KEY_NAME,
    expiresAt: grant.expiresAt,
    predefinedKeys: {
      publicKey: `${SANDBOX_PUBLIC_KEY_PREFIX}${randomUUID()}`,
      secretKey: `sk-lf-${randomUUID()}`,
    },
  });

  return {
    id: key.id,
    publicKey: key.publicKey,
    secretKey: key.secretKey,
    expiresAt: grant.expiresAt,
  };
}

/** Deletes the key row, then evicts the auth cache. A row that is already gone counts as revoked. */
export async function revokeSandboxKey(params: {
  prisma: PrismaClient;
  redis?: Redis | Cluster | null;
  projectId: string;
  apiKeyId: string;
}): Promise<void> {
  try {
    await deleteApiKeyFromDb({
      prisma: params.prisma,
      redis: params.redis,
      id: params.apiKeyId,
      entityId: params.projectId,
      scope: "PROJECT",
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return;
    }
    throw error;
  }
}
