import { PrismaClient, ApiKeyScope, type Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { randomUUID } from "crypto";
import * as crypto from "crypto";
import type { Cluster, Redis } from "ioredis";
import { env } from "../../env";
import { InvalidRequestError } from "../../errors";
import {
  ApiKeyId,
  OrganizationId,
  hasApiKeyKind,
  hasOrganizationKind,
  hasProjectKind,
  hasSystemRoleKind,
  toSystemRole,
  untag,
  type OwnerId,
  type RoleId,
  type UserId,
} from "../../features/rbac/types";
import {
  isApiKeyRole,
  roleHasProjectPolicy,
} from "../../features/rbac/systemRoleAccessRights";
import { logger } from "../logger";
import { assignRole } from "../../features/rbac/roleAssignmentRepository";
import { invalidateCachedApiKeys } from "./invalidateApiKeys";
import { withTransaction } from "../utils/withTransaction";

export function getDisplaySecretKey(secretKey: string) {
  return secretKey.slice(0, 6) + "..." + secretKey.slice(-4);
}

const LANGFUSE_SECRET_KEY_PATTERN = /sk-lf-[A-Za-z0-9_-]+/g;

/**
 * Replaces every Langfuse secret key inside a user-controlled string with its
 * display form (`sk-lf-...abcd`), so the value can be logged or attached to a
 * span without exposing the secret.
 */
export function redactLangfuseSecretKeys(value: string): string {
  return value.replace(LANGFUSE_SECRET_KEY_PATTERN, (match) =>
    getDisplaySecretKey(match),
  );
}

const MAX_LOGGED_PUBLIC_KEY_LENGTH = 64;

/** formatSubmittedPublicKeyForLog masks values without a pk-lf- prefix and sanitizes untrusted input for logging. */
export function formatSubmittedPublicKeyForLog(value: string): string {
  let formatted: string;
  if (value.startsWith("pk-lf-")) formatted = value;
  else if (value.length < 12) formatted = "****";
  else formatted = getDisplaySecretKey(value);

  return JSON.stringify(
    formatted
      .slice(0, MAX_LOGGED_PUBLIC_KEY_LENGTH)
      .replace(/[^\x20-\x7e]/g, "\uFFFD"),
  );
}

export async function hashSecretKey(key: string) {
  // legacy, uses bcrypt, transformed into hashed key upon first use
  const hashedKey = await hash(key, 11);
  return hashedKey;
}

export async function generateKeySet() {
  return {
    pk: `pk-lf-${randomUUID()}`,
    sk: `sk-lf-${randomUUID()}`,
  };
}

export async function verifySecretKey(key: string, hashedKey: string) {
  const isValid = await compare(key, hashedKey);
  return isValid;
}

export function createShaHash(privateKey: string, salt: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(privateKey)
    .update(crypto.createHash("sha256").update(salt, "utf8").digest("hex"))
    .digest("hex");

  return hash;
}

/** createApiKey inserts an api-key row and its single system-role assignment, keyed on the owner. */
export async function createApiKey(
  prisma: PrismaClient | Prisma.TransactionClient,
  opts: {
    owner: OwnerId;
    role: RoleId;
    createdBy: ApiKeyId | UserId | "system";
    name?: string;
    /** note is deprecated; use name instead and never provide both. */
    note?: string;
    expiresAt?: Date | null;
    isInAppAgentKey?: boolean;
    predefinedKeys?: { secretKey: string; publicKey: string };
  },
): Promise<{
  id: string;
  createdAt: Date;
  note: string | null;
  publicKey: string;
  displaySecretKey: string;
  secretKey: string;
}> {
  if (opts.name !== undefined && opts.note !== undefined) {
    throw new InvalidRequestError("Provide either name or note, not both");
  }

  const salt = env.SALT;
  if (!salt) {
    throw new Error("SALT is not set");
  }

  if (hasSystemRoleKind(opts.role)) {
    const role = toSystemRole(opts.role);
    const isProjectOwner = hasProjectKind(opts.owner);
    // A key can only carry a role tagged for api keys; a project owner also
    // needs a project-kind policy, or the key grants nothing on its project.
    if (
      !isApiKeyRole(role) ||
      (isProjectOwner && !roleHasProjectPolicy(role))
    ) {
      throw new InvalidRequestError(
        `Role ${role} cannot back ${
          isProjectOwner ? "a project" : "an organization"
        } API key`,
      );
    }
  }

  const { pk, sk } = opts.predefinedKeys
    ? { pk: opts.predefinedKeys.publicKey, sk: opts.predefinedKeys.secretKey }
    : await generateKeySet();

  const scope = hasOrganizationKind(opts.owner) ? "ORGANIZATION" : "PROJECT";
  const data: Prisma.ApiKeyUncheckedCreateInput = {
    ...(scope === "ORGANIZATION"
      ? { orgId: untag(opts.owner) }
      : { projectId: untag(opts.owner) }),
    publicKey: pk,
    hashedSecretKey: await hashSecretKey(sk),
    displaySecretKey: getDisplaySecretKey(sk),
    fastHashedSecretKey: createShaHash(sk, salt),
    note: opts.name ?? opts.note,
    scope,
    expiresAt: opts.expiresAt ?? null,
    isInAppAgentKey: opts.isInAppAgentKey ?? false,
    ...creatorColumns(opts.createdBy),
  };

  const created = await withTransaction(prisma, (tx) =>
    insertApiKey(tx, data, opts),
  );
  return { ...created, secretKey: sk };
}

/** creatorColumns maps a key's creator to its api-key columns; "system" records none. */
function creatorColumns(
  createdBy: ApiKeyId | UserId | "system",
): Pick<
  Prisma.ApiKeyUncheckedCreateInput,
  "createdByApiKeyId" | "createdByUserId"
> {
  if (createdBy === "system") return {};
  return hasApiKeyKind(createdBy)
    ? { createdByApiKeyId: untag(createdBy) }
    : { createdByUserId: untag(createdBy) };
}

/** insertApiKey writes the api-key row and its one owner-keyed role assignment on a single transaction client. */
async function insertApiKey(
  tx: Prisma.TransactionClient,
  data: Prisma.ApiKeyUncheckedCreateInput,
  opts: { owner: OwnerId; role: RoleId },
) {
  const apiKey = await tx.apiKey.create({ data });
  const orgId = hasOrganizationKind(opts.owner)
    ? untag(opts.owner)
    : (
        await tx.project.findFirstOrThrow({
          where: { id: untag(opts.owner) },
          select: { orgId: true },
        })
      ).orgId;
  await assignRole(tx, {
    tenantId: OrganizationId(orgId),
    principalId: ApiKeyId(apiKey.id),
    roleId: opts.role,
    ownerId: opts.owner,
    tags: [],
  });
  return {
    id: apiKey.id,
    createdAt: apiKey.createdAt,
    note: apiKey.note,
    publicKey: apiKey.publicKey,
    displaySecretKey: apiKey.displaySecretKey,
  };
}

export async function deleteApiKeyFromDb(p: {
  prisma: PrismaClient;
  id: string;
  entityId: string;
  scope: ApiKeyScope;
  redis?: Redis | Cluster | null;
  /**
   * When true, only delete keys minted for in-app agent MCP sessions.
   * A matching project key that is not an agent key is left intact.
   */
  isInAppAgentKey?: boolean;
}) {
  const entity =
    p.scope === "PROJECT" ? { projectId: p.entityId } : { orgId: p.entityId };

  const apiKey = await p.prisma.apiKey.findFirstOrThrow({
    where: {
      ...entity,
      id: p.id,
      scope: p.scope,
    },
  });

  if (p.isInAppAgentKey === true && apiKey.isInAppAgentKey !== true) {
    logger.warn(
      "Refusing to delete API key that is not an in-app agent MCP key",
      {
        apiKeyId: p.id,
        entityId: p.entityId,
        scope: p.scope,
      },
    );
    return false;
  }

  // The row goes first, then the cache. In the other order, a request
  // authenticating with this key in between misses the cache, still finds the
  // row, and writes the key back into the cache after the eviction. `apiKey` is
  // already loaded above, so eviction does not need the row to still exist.
  await p.prisma.apiKey.delete({
    where: {
      id: apiKey.id,
    },
  });

  await invalidateCachedApiKeys([apiKey], `key ${p.id}`, p.redis);

  return true;
}

/** Delete an in-app agent MCP session key. Skips user project keys. */
export async function deleteInAppAgentMcpApiKeyFromDb(p: {
  prisma: PrismaClient;
  id: string;
  projectId: string;
  redis?: Redis | Cluster | null;
}) {
  return deleteApiKeyFromDb({
    prisma: p.prisma,
    id: p.id,
    entityId: p.projectId,
    scope: "PROJECT",
    redis: p.redis,
    isInAppAgentKey: true,
  });
}
