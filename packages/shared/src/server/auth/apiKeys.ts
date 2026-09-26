import { PrismaClient, ApiKeyScope, type Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { randomUUID } from "crypto";
import * as crypto from "crypto";
import type { Cluster, Redis } from "ioredis";
import { env } from "../../env";
import {
  ApiKeyId,
  hasApiKeyKind,
  hasOrganizationKind,
  untag,
  type OwnerId,
  type RoleId,
  type UserId,
} from "../../features/rbac/types";
import { logger } from "../logger";
import {
  assignRole,
  revokeRolesForPrincipals,
} from "../../features/rbac/roleAssignmentRepository";
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

/** createApiKey inserts an api-key row and its single system-role assignment, keyed on the owner. */
export async function createApiKey(
  prisma: PrismaClient | Prisma.TransactionClient,
  opts: {
    owner: OwnerId;
    role: RoleId;
    creator: ApiKeyId | UserId;
    name?: string;
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
  const salt = env.SALT;
  if (!salt) {
    throw new Error("SALT is not set");
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
    note: opts.name,
    scope,
    expiresAt: opts.expiresAt ?? null,
    isInAppAgentKey: opts.isInAppAgentKey ?? false,
    ...(hasApiKeyKind(opts.creator)
      ? { createdByApiKeyId: untag(opts.creator) }
      : { createdByUserId: untag(opts.creator) }),
  };

  // A root client owns the transaction; a transaction client joins the caller's.
  const insert = (tx: Prisma.TransactionClient) => insertApiKey(tx, data, opts);
  const created = isPrismaClient(prisma)
    ? await prisma.$transaction(insert)
    : await insert(prisma);
  return { ...created, secretKey: sk };
}

/** isPrismaClient narrows a client to a root client, which can own a transaction. */
function isPrismaClient(
  client: PrismaClient | Prisma.TransactionClient,
): client is PrismaClient {
  return "$transaction" in client;
}

/** insertApiKey writes the api-key row and its one owner-keyed role assignment on a single transaction client. */
async function insertApiKey(
  tx: Prisma.TransactionClient,
  data: Prisma.ApiKeyUncheckedCreateInput,
  opts: { owner: OwnerId; role: RoleId },
) {
  const apiKey = await tx.apiKey.create({ data });
  await assignRole(tx, {
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

  // Delete the row and its assignment atomically, then evict the cache after
  // the commit so a concurrent authentication cannot re-cache the key from a
  // row that is about to be gone. principalId is a tagged string, not an FK, so
  // the delete does not cascade to the assignment.
  await p.prisma.$transaction(async (tx) => {
    await tx.apiKey.delete({ where: { id: apiKey.id } });
    await revokeRolesForPrincipals(tx, [ApiKeyId(apiKey.id)]);
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
