import { randomUUID } from "crypto";
import type { Cluster, Redis } from "ioredis";
import { Prisma, Role, type PrismaClient } from "../../db";
import { ForbiddenError, InvalidRequestError } from "../../errors";
import { projectRoleAccessRights } from "../../features/rbac/projectAccessRights";
import type {
  Action,
  ProjectAction,
} from "../../features/rbac/systemRoleAccessRights";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
} from "../../features/rbac/types";
import { createApiKey, deleteApiKeyFromDb } from "../../server/auth/apiKeys";
import { logger } from "../../server/logger";
import { redis as defaultRedis } from "../../server/redis/redis";
import { queryClickhouse } from "../../server/repositories/clickhouse";
import { SANDBOX_PUBLIC_KEY_PREFIX } from "../constants";

/**
 * Langfuse API keys for scripts the in-app agent runs in its sandbox.
 *
 * One key per approved script. The worker mints it outside the agent loop,
 * hands it to the guest as process environment, and deletes the row when the
 * script completes, fails, or is cancelled. The key stops working once the row
 * is deleted or its expiry passes, whichever comes first.
 *
 * A sandbox key is a project key bound to the user who approved the script.
 * Its role assignment is that user's project role, resolved at mint, and the
 * API auth resolver caps every sandbox key at `SANDBOX_KEY_SCOPE`. Effective
 * permissions are therefore `user's role ∩ SANDBOX_KEY_SCOPE`, fixed for the
 * key's short lifetime.
 */

const SANDBOX_KEY_NAME = "In-app agent sandbox script";

/** Upper bound on a sandbox key's lifetime, whatever the script deadline. */
export const SANDBOX_KEY_MAX_TTL_MS = 15 * 60 * 1000;

/**
 * The sandbox role: the most a sandbox key can do, whatever the user's role.
 * Member management, LLM connections, API keys, project settings, and
 * integrations are left out on purpose.
 */
export const SANDBOX_KEY_SCOPE: readonly ProjectAction[] = [
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

const sandboxKeyScope: ReadonlySet<Action> = new Set(SANDBOX_KEY_SCOPE);

/** Whether a sandbox key may ever carry `action`. */
export function isSandboxKeyAction(action: Action): boolean {
  return sandboxKeyScope.has(action);
}

export type SandboxKey = {
  id: string;
  publicKey: string;
  secretKey: string;
  expiresAt: Date;
};

/**
 * Mints the key for one approved script, bound to `userId`.
 *
 * Refuses when the user has no access to the project, or when their role
 * leaves nothing of `SANDBOX_KEY_SCOPE`.
 */
export async function mintUserBoundSandboxKey(
  prisma: PrismaClient,
  params: { userId: string; projectId: string; expiresAt: Date },
): Promise<SandboxKey> {
  const ttlMs = params.expiresAt.getTime() - Date.now();
  if (ttlMs <= 0 || ttlMs > SANDBOX_KEY_MAX_TTL_MS) {
    throw new InvalidRequestError(
      `Sandbox key expiry must be within ${SANDBOX_KEY_MAX_TTL_MS / 60_000} minutes`,
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: params.projectId, deletedAt: null },
    select: { orgId: true },
  });
  if (!project) {
    throw new ForbiddenError("User has no access to this project");
  }

  const role = await resolveUserProjectRole(prisma, {
    userId: params.userId,
    projectId: params.projectId,
    orgId: project.orgId,
  });
  if (
    role === null ||
    !projectRoleAccessRights[role].some((action) => sandboxKeyScope.has(action))
  ) {
    throw new ForbiddenError("User has no access to this project");
  }

  const key = await createApiKey(prisma, {
    tenant: OrganizationId(project.orgId),
    scope: ProjectId(params.projectId),
    role: SystemRoleId(role),
    createdBy: UserId(params.userId),
    boundUser: UserId(params.userId),
    name: SANDBOX_KEY_NAME,
    expiresAt: params.expiresAt,
    predefinedKeys: {
      publicKey: `${SANDBOX_PUBLIC_KEY_PREFIX}${randomUUID()}`,
      secretKey: `sk-lf-${randomUUID()}`,
    },
  });

  return {
    id: key.id,
    publicKey: key.publicKey,
    secretKey: key.secretKey,
    expiresAt: params.expiresAt,
  };
}

/** Project role of a member, or OWNER for an instance admin; null without access. */
async function resolveUserProjectRole(
  prisma: PrismaClient,
  params: { userId: string; projectId: string; orgId: string },
): Promise<Role | null> {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      admin: true,
      organizationMemberships: {
        where: { orgId: params.orgId },
        select: {
          role: true,
          ProjectMemberships: {
            where: { projectId: params.projectId },
            select: { role: true },
          },
        },
      },
    },
  });
  if (!user) return null;
  if (user.admin) return Role.OWNER;
  const orgMembership = user.organizationMemberships[0];
  if (!orgMembership) return null;
  const role = orgMembership.ProjectMemberships[0]?.role ?? orgMembership.role;
  return role === Role.NONE ? null : role;
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

const TRACE_CLAIM_TTL_SECONDS = Math.ceil(SANDBOX_KEY_MAX_TTL_MS / 1000) + 60;

/**
 * Sandbox keys may create traces but not write into existing ones. A trace ID
 * is writable when this key claimed it earlier, or when no trace with that ID
 * exists yet, in which case the key claims it now. Claims live in Redis for
 * the key's maximum lifetime.
 *
 * Returns the IDs the key may not write. Without Redis every ID is refused.
 */
export async function findUnwritableSandboxTraceIds(params: {
  projectId: string;
  publicKey: string;
  traceIds: Iterable<string>;
  redis?: Redis | Cluster | null;
}): Promise<string[]> {
  const traceIds = [...new Set(params.traceIds)];
  if (traceIds.length === 0) return [];
  const redis = params.redis === undefined ? defaultRedis : params.redis;
  if (!redis) {
    logger.warn("Refusing sandbox key trace writes: Redis is not available");
    return traceIds;
  }

  const claimKey = `langfuse:in-app-agent:sandbox-key:${params.publicKey}:traces`;
  const claimed = await redis.smismember(claimKey, ...traceIds);
  const unclaimed = traceIds.filter((_, index) => claimed[index] !== 1);
  if (unclaimed.length === 0) return [];

  const existing = new Set(
    (
      await queryClickhouse<{ id: string }>({
        query: `
          SELECT id FROM traces
          WHERE project_id = {projectId: String} AND id IN {traceIds: Array(String)}
          UNION ALL
          SELECT trace_id AS id FROM events_core
          WHERE project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}
        `,
        params: { projectId: params.projectId, traceIds: unclaimed },
        tags: { projectId: params.projectId },
      })
    ).map((row) => row.id),
  );

  const claimable = unclaimed.filter((id) => !existing.has(id));
  if (claimable.length > 0) {
    await redis
      .multi()
      .sadd(claimKey, ...claimable)
      .expire(claimKey, TRACE_CLAIM_TTL_SECONDS)
      .exec();
  }
  return unclaimed.filter((id) => existing.has(id));
}
