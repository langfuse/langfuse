import { PrismaClient, ApiKeyScope, type Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { randomUUID } from "crypto";
import * as crypto from "crypto";
import type { Cluster, Redis } from "ioredis";
import { env } from "../../env";
import { InvalidRequestError } from "../../errors";
import {
  ApiKeyId,
  hasApiKeyKind,
  hasProjectKind,
  untag,
  type OrganizationId,
  type OwnerId,
  type ProjectId,
  type RoleId,
  type TenantId,
  type UserId,
} from "../../features/rbac/types";
import { logger } from "../logger";
import { assignRole } from "../../features/rbac/roleAssignmentService";
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

/** hashSecretKey produces the legacy bcrypt form of keys created before the fast hash; verification backfills their fast hash on first use. */
export async function hashSecretKey(key: string) {
  const hashedKey = await hash(key, 11);
  return hashedKey;
}

/**
 * createLegacySecretKeyPlaceholder fills the legacy bcrypt column
 * (hashedSecretKey) of a new key. New keys verify only through their fast
 * hash, so the column holds a unique non-secret value that no bcrypt
 * comparison matches.
 */
export function createLegacySecretKeyPlaceholder(): string {
  return `unused:${randomUUID()}`;
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

/** createApiKey creates a new api key */
export async function createApiKey(
  prisma: PrismaClient | Prisma.TransactionClient,
  opts: {
    tenant: TenantId;
    scope: OrganizationId | ProjectId | UserId;
    role: RoleId;
    createdBy: ApiKeyId | UserId | "system";
    name?: string;
    /** @deprecated Use name instead; name and note are mutually exclusive. */
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
  const apiKeyParams = validateApiKeyParams(opts);
  const { secretKey, ...keyMaterialParams } = await generateKeyMaterial(opts);

  const apiKey = await withTransaction(prisma, async (tx) => {
    const apiKey = await tx.apiKey.create({
      data: { ...apiKeyParams, ...keyMaterialParams },
    });
    await assignRole(tx, {
      tenantId: opts.tenant,
      principalId: ApiKeyId(apiKey.id),
      roleId: opts.role,
      ownerId: toOwnerId(opts),
      tags: [],
    });
    return apiKey;
  });
  return {
    id: apiKey.id,
    createdAt: apiKey.createdAt,
    note: apiKey.note,
    publicKey: apiKey.publicKey,
    displaySecretKey: apiKey.displaySecretKey,
    secretKey,
  };
}

/** validateApiKeyParams provides the validated non-secret columns for api key creation */
function validateApiKeyParams(opts: {
  tenant: TenantId;
  scope: OrganizationId | ProjectId | UserId;
  createdBy: ApiKeyId | UserId | "system";
  name?: string;
  note?: string;
  expiresAt?: Date | null;
  isInAppAgentKey?: boolean;
}): Omit<
  Prisma.ApiKeyUncheckedCreateInput,
  "publicKey" | "hashedSecretKey" | "fastHashedSecretKey" | "displaySecretKey"
> {
  return {
    ...noteColumn(opts),
    ...scopeColumns(opts.tenant, opts.scope),
    ...creatorColumns(opts.createdBy),
    expiresAt: opts.expiresAt ?? null,
    isInAppAgentKey: opts.isInAppAgentKey ?? false,
  };
}

/** noteColumn provides the note column for api key creation */
function noteColumn({
  name,
  note,
}: {
  name?: string;
  note?: string;
}): Pick<Prisma.ApiKeyUncheckedCreateInput, "note"> {
  if (name !== undefined && note !== undefined) {
    throw new InvalidRequestError("Provide either name or note, not both");
  }
  return { note: name ?? note };
}

/** scopeColumns provides scope columns for api key creation */
function scopeColumns(
  tenant: TenantId,
  scope: OrganizationId | ProjectId | UserId,
): Pick<
  Prisma.ApiKeyUncheckedCreateInput,
  "orgId" | "projectId" | "userId" | "scope"
> {
  if (hasUserScope(scope)) {
    return {
      orgId: untag(tenant),
      userId: untag(scope),
      scope: "ORGANIZATION",
    };
  }
  if (hasProjectKind(scope)) {
    return { projectId: untag(scope), scope: "PROJECT" };
  }
  return { orgId: untag(scope), scope: "ORGANIZATION" };
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

/** generateKeyMaterial provides the key columns and plaintext secret for api key creation */
async function generateKeyMaterial({
  predefinedKeys,
}: {
  predefinedKeys?: { secretKey: string; publicKey: string };
}): Promise<
  Pick<
    Prisma.ApiKeyUncheckedCreateInput,
    "publicKey" | "hashedSecretKey" | "fastHashedSecretKey" | "displaySecretKey"
  > & { secretKey: string }
> {
  const salt = env.SALT;
  if (!salt) {
    throw new Error("SALT is not set");
  }

  let keys = predefinedKeys;
  if (!keys) {
    const { pk, sk } = await generateKeySet();
    keys = { publicKey: pk, secretKey: sk };
  }
  return {
    publicKey: keys.publicKey,
    hashedSecretKey: createLegacySecretKeyPlaceholder(),
    fastHashedSecretKey: createShaHash(keys.secretKey, salt),
    displaySecretKey: getDisplaySecretKey(keys.secretKey),
    secretKey: keys.secretKey,
  };
}

/** toOwnerId provides the role assignment owner for an api key's scope */
function toOwnerId({
  tenant,
  scope,
}: {
  tenant: TenantId;
  scope: OrganizationId | ProjectId | UserId;
}): OwnerId {
  if (hasUserScope(scope)) return tenant;
  return scope;
}

/** hasUserScope narrows an api key's scope to a user. */
function hasUserScope(
  scope: OrganizationId | ProjectId | UserId,
): scope is UserId {
  return scope.startsWith("user/");
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
