import { PrismaClient, ApiKeyScope, type Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { randomUUID } from "crypto";
import * as crypto from "crypto";
import { env } from "../../env";
import {
  ApiKeyId,
  hasApiKeyKind,
  hasProjectKind,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  untag,
  type OwnerId,
  type RoleAssignment,
  type RoleId,
  type TenantId,
  UserId,
} from "../../features/rbac/types";
import { assignRole } from "../../features/rbac/roleAssignmentService";
import { withTransaction } from "../utils/withTransaction";

/** orgBoundApiKeyScopes are the scopes of keys that belong to an organization through their orgId. */
export const orgBoundApiKeyScopes: ApiKeyScope[] = ["ORGANIZATION", "USER"];

/** deletedApiKeySelect is every api key column an audit record may hold; hashedSecretKey stays out */
const deletedApiKeySelect = {
  id: true,
  publicKey: true,
  displaySecretKey: true,
  fastHashedSecretKey: true,
  note: true,
  scope: true,
  orgId: true,
  projectId: true,
  userId: true,
  isInAppAgentKey: true,
  createdAt: true,
  expiresAt: true,
  lastUsedAt: true,
  createdByUserId: true,
  createdByApiKeyId: true,
} satisfies Prisma.ApiKeySelect;

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
  expiresAt?: Date | null;
  isInAppAgentKey?: boolean;
}): Omit<
  Prisma.ApiKeyUncheckedCreateInput,
  "publicKey" | "hashedSecretKey" | "fastHashedSecretKey" | "displaySecretKey"
> {
  return {
    note: opts.name,
    ...scopeColumns(opts.tenant, opts.scope),
    ...creatorColumns(opts.createdBy),
    expiresAt: opts.expiresAt ?? null,
    isInAppAgentKey: opts.isInAppAgentKey ?? false,
  };
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
      scope: "USER",
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

/**
 * getApiKeyRoles share-locks an api key and returns the legacy role assignment its scope implies in its current org.
 * @deprecated RoleAssignment backfill will be removed in the next major version.
 */
export async function getApiKeyRoles(
  tx: Prisma.TransactionClient,
  { apiKeyId }: { apiKeyId: string },
): Promise<Omit<RoleAssignment, "id" | "createdAt" | "updatedAt">[]> {
  const keys = await tx.$queryRaw<
    { scope: ApiKeyScope; orgId: string; projectId: string | null }[]
  >`
    SELECT k.scope, COALESCE(p.org_id, k.organization_id) AS "orgId", k.project_id AS "projectId"
    FROM api_keys k
    LEFT JOIN projects p ON p.id = k.project_id
    WHERE k.id = ${apiKeyId}
    FOR SHARE OF k
  `;
  return keys.map((key) => apiKeyRole({ ...key, apiKeyId }));
}

/** apiKeyRole maps an api key to the legacy role assignment its scope implies. */
function apiKeyRole({
  apiKeyId,
  scope,
  orgId,
  projectId,
}: {
  apiKeyId: string;
  scope: ApiKeyScope;
  orgId: string;
  projectId: string | null;
}): Omit<RoleAssignment, "id" | "createdAt" | "updatedAt"> {
  const principal = {
    tenantId: OrganizationId(orgId),
    principalId: ApiKeyId(apiKeyId),
    tags: [],
  };
  if (scope === "PROJECT" && projectId !== null) {
    return {
      ...principal,
      ownerId: ProjectId(projectId),
      roleId: SystemRoleId("LEGACY_PROJECT_API_KEY"),
    };
  }
  return {
    ...principal,
    ownerId: OrganizationId(orgId),
    roleId: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
  };
}

/** deleteApiKey deletes one api key in scope and returns it, or null when none matches */
export async function deleteApiKey(
  prisma: PrismaClient | Prisma.TransactionClient,
  params: DeleteApiKeysParams & { id: ApiKeyId },
): Promise<DeletedApiKey | null> {
  const [apiKey] = await deleteMatchingApiKeys(prisma, {
    id: untag(params.id),
    ...apiKeyScopeWhere(params),
  });
  return apiKey ?? null;
}

/** deleteApiKeys deletes every api key in scope and returns them */
export async function deleteApiKeys(
  prisma: PrismaClient | Prisma.TransactionClient,
  params: DeleteApiKeysParams,
): Promise<DeletedApiKey[]> {
  return deleteMatchingApiKeys(prisma, apiKeyScopeWhere(params));
}

/** deleteMatchingApiKeys deletes the api keys it finds, so a key created concurrently in scope survives */
async function deleteMatchingApiKeys(
  prisma: PrismaClient | Prisma.TransactionClient,
  where: Prisma.ApiKeyWhereInput,
): Promise<DeletedApiKey[]> {
  return withTransaction(prisma, async (tx) => {
    const apiKeys = await tx.apiKey.findMany({
      where,
      select: deletedApiKeySelect,
    });
    if (apiKeys.length === 0) return apiKeys;
    await tx.apiKey.deleteMany({
      where: { id: { in: apiKeys.map((apiKey) => apiKey.id) } },
    });
    return apiKeys;
  });
}

/** apiKeyScopeWhere maps deletion params to an api key filter */
function apiKeyScopeWhere(
  params: DeleteApiKeysParams,
): Prisma.ApiKeyWhereInput {
  return {
    ...scopeWhere(params),
    ...inAppAgentKeyWhere(params.isInAppAgentKey),
  };
}

/** scopeWhere filters by the columns createApiKey writes for the scope; a user scope without tenant spans every organization */
function scopeWhere(params: DeleteApiKeysParams): Prisma.ApiKeyWhereInput {
  if ("tenant" in params && params.tenant) {
    return scopeColumns(params.tenant, params.scope);
  }
  if (hasUserScope(params.scope)) {
    return { userId: untag(params.scope), scope: "USER" };
  }
  if (hasProjectKind(params.scope)) {
    return { projectId: untag(params.scope), scope: "PROJECT" };
  }
  return { orgId: untag(params.scope), scope: "ORGANIZATION" };
}

/** inAppAgentKeyWhere filters on the in-app agent flag unless it is undefined */
function inAppAgentKeyWhere(
  isInAppAgentKey: boolean | undefined,
): Prisma.ApiKeyWhereInput {
  if (isInAppAgentKey === undefined) return {};
  return { isInAppAgentKey };
}

/** orgBoundApiKeyDeleteScope is the deletion scope of an api key bound to orgId */
export function orgBoundApiKeyDeleteScope(
  orgId: string,
  apiKey: { scope: ApiKeyScope; userId: string | null },
): DeleteApiKeysParams {
  if (apiKey.scope === "USER" && apiKey.userId) {
    return { tenant: OrganizationId(orgId), scope: UserId(apiKey.userId) };
  }
  return { scope: OrganizationId(orgId) };
}

/** DeleteApiKeysParams scopes an api key deletion; isInAppAgentKey left undefined matches both kinds */
type DeleteApiKeysParams =
  | { scope: OrganizationId | ProjectId; isInAppAgentKey?: boolean }
  | { tenant?: TenantId; scope: UserId; isInAppAgentKey?: boolean };

/** DeletedApiKey is the non-secret snapshot of a deleted api key */
type DeletedApiKey = Prisma.ApiKeyGetPayload<{
  select: typeof deletedApiKeySelect;
}>;
