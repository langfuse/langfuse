import { PrismaClient, ApiKeyScope, type Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { randomUUID } from "crypto";
import * as crypto from "crypto";
import type { Cluster, Redis } from "ioredis";
import { env } from "../../env";
import {
  ApiKeyId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
} from "../../features/rbac/types";
import { logger } from "../logger";
import { assignRole, revokeRole } from "./assignRole";
import { invalidateCachedApiKeys } from "./invalidateApiKeys";

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

/**
 * Formats a client-submitted public key for logging. Only a value that is
 * actually a Langfuse public key is echoed verbatim; anything else is masked to
 * its display form because it may be a secret placed in the wrong slot.
 */
export function formatSubmittedPublicKeyForLog(value: string): string {
  if (value.startsWith("pk-lf-")) return value;
  if (value.length < 12) return "****";
  return getDisplaySecretKey(value);
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

export async function createAndAddApiKeysToDb(p: {
  // Accepts a transaction client so callers can commit key creation
  // atomically with linking the key to its owner (e.g. an agent run row).
  prisma: PrismaClient | Prisma.TransactionClient;
  entityId: string;
  scope: ApiKeyScope;
  note?: string;
  isInAppAgentKey?: boolean;
  /** User who created the key, e.g. via the UI. */
  createdByUserId?: string;
  /** API key that created the key, e.g. an org-scoped key using the public API. */
  createdByApiKeyId?: string;
  predefinedKeys?: {
    secretKey: string;
    publicKey: string;
  };
}) {
  const salt = env.SALT;
  if (!salt) {
    throw new Error("SALT is not set");
  }

  const { pk, sk } = p.predefinedKeys
    ? { pk: p.predefinedKeys.publicKey, sk: p.predefinedKeys.secretKey }
    : await generateKeySet();

  const hashedSk = await hashSecretKey(sk);
  const displaySk = getDisplaySecretKey(sk);

  const hashFromProvidedKey = createShaHash(sk, salt);

  const entity =
    p.scope === "PROJECT" ? { projectId: p.entityId } : { orgId: p.entityId };

  const apiKey = await p.prisma.apiKey.create({
    data: {
      ...entity,
      publicKey: pk,
      hashedSecretKey: hashedSk,
      displaySecretKey: displaySk,
      fastHashedSecretKey: hashFromProvidedKey,
      note: p.note,
      scope: p.scope,
      isInAppAgentKey: p.isInAppAgentKey ?? false,
      createdByUserId: p.createdByUserId,
      createdByApiKeyId: p.createdByApiKeyId,
    },
  });

  // The role derived from `scope` reproduces today's apiKeyAccessRights[scope].
  // Written on the caller's client so it commits atomically with the key.
  await assignRole(p.prisma, {
    principalId: ApiKeyId(apiKey.id),
    roleId: SystemRoleId(p.scope === "PROJECT" ? "PROJECT" : "ORGANIZATION"),
    ownerId:
      p.scope === "PROJECT"
        ? ProjectId(p.entityId)
        : OrganizationId(p.entityId),
    tags: [],
  });

  return {
    id: apiKey.id,
    createdAt: apiKey.createdAt,
    note: apiKey.note,
    publicKey: apiKey.publicKey,
    secretKey: sk,
    displaySecretKey: displaySk,
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

  // The row and its assignment go first in one transaction, then the cache.
  // principalId is a tagged string, not an FK, so the delete does not cascade.
  // In the other order, a request authenticating with this key in between
  // misses the cache, still finds the row, and writes the key back into the
  // cache after the eviction. `apiKey` is already loaded above, so eviction
  // does not need the row to still exist.
  await p.prisma.$transaction(async (tx) => {
    await tx.apiKey.delete({ where: { id: apiKey.id } });
    await revokeRole(tx, { principalId: ApiKeyId(apiKey.id) });
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
