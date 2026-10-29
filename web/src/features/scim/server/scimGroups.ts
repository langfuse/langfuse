import { type NextApiRequest, type NextApiResponse } from "next";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server";
import { shadowAuth, writeScimError } from "@/src/features/public-api/server";

// SCIM 2.0 Groups (RFC 7643 4.2, RFC 7644 3). Groups are pushed by the
// organization's IdP (Okta Group Push, Entra ID provisioning). SCIM only syncs
// groups and their members; org admins map groups to roles in Langfuse, and a
// SCIM sync never touches those role assignments or organization_memberships.
//
// The PATCH/PUT semantics follow what Okta and Entra actually send, mirroring
// ClickHouse Cloud's SCIM Groups handler:
// - op names are case-insensitive (Entra sends "Add"/"Remove"/"Replace")
// - members can be removed with `path: members[value eq "id"]` (Okta) or with
//   `path: members` plus a value array (Entra)
// - a pathless op carries `{ displayName, externalId, members }` (Okta)
// - member ids that are not members of the organization reject the request
//   (400) on add/replace, and are a no-op on remove

const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_PATCH_OP_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_LIST_RESPONSE_SCHEMA =
  "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";

export const SCIM_GROUPS_MAX_RESULTS = 100;

class ScimError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public scimType?: string,
  ) {
    super(detail);
  }
}

export function writeScimErrorResponse(
  res: NextApiResponse,
  status: number,
  detail: string,
  scimType?: string,
) {
  return res.status(status).json({
    schemas: [SCIM_ERROR_SCHEMA],
    detail,
    status,
    ...(scimType ? { scimType } : {}),
  });
}

/**
 * Authenticates a SCIM Groups request with an organization API key and checks
 * the `admin-api` entitlement, matching the SCIM Users endpoints. Returns null
 * when the response has already been written.
 */
export async function authorizeScimGroupsRequest(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<{ orgId: string; apiKeyId: string } | null> {
  const authCheck = await shadowAuth({
    req,
    action:
      req.method === "GET"
        ? "organizationMembers:read"
        : "organizationMembers:CUD",
    allowedAccessLevels: ["organization"],
  });
  if (!authCheck.success) {
    writeScimError(res, authCheck.error);
    return null;
  }

  if (
    !hasEntitlementBasedOnPlan({
      plan: authCheck.scope.plan,
      entitlement: "admin-api",
    })
  ) {
    writeScimErrorResponse(
      res,
      403,
      "This feature is not available on your current plan.",
    );
    return null;
  }

  return {
    orgId: authCheck.scope.orgId,
    apiKeyId: authCheck.scope.apiKeyId,
  };
}

/** Parses a JSON body that Next.js left as a string (SCIM clients send application/scim+json). */
export function parseScimBody(req: NextApiRequest): Record<string, unknown> {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      throw new ScimError(400, "Invalid JSON body", "invalidSyntax");
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ScimError(
      400,
      "Request body must be a JSON object",
      "invalidSyntax",
    );
  }
  return body as Record<string, unknown>;
}

/** True when `excludedAttributes` (comma separated) contains `members`. */
export function isMembersExcluded(req: NextApiRequest): boolean {
  const raw = req.query.excludedAttributes;
  const value = Array.isArray(raw) ? raw.join(",") : raw;
  if (!value) return false;
  return value
    .split(",")
    .map((attr) => attr.trim().toLowerCase())
    .includes("members");
}

const groupWithMembers = {
  include: {
    members: {
      include: {
        organizationMembership: {
          select: { userId: true, user: { select: { email: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    },
  },
} satisfies Prisma.GroupDefaultArgs;

export type ScimGroupWithMembers = Prisma.GroupGetPayload<
  typeof groupWithMembers
>;

export function toScimGroup(
  group: ScimGroupWithMembers,
  opts: { excludeMembers?: boolean } = {},
) {
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: group.id,
    displayName: group.displayName,
    ...(group.externalId ? { externalId: group.externalId } : {}),
    ...(opts.excludeMembers
      ? {}
      : {
          members: group.members.map(({ organizationMembership }) => ({
            value: organizationMembership.userId,
            display: organizationMembership.user.email ?? undefined,
            $ref: `/api/public/scim/Users/${organizationMembership.userId}`,
            type: "User",
          })),
        }),
    meta: {
      resourceType: "Group",
      created: group.createdAt.toISOString(),
      lastModified: group.updatedAt.toISOString(),
      location: `/api/public/scim/Groups/${group.id}`,
    },
  };
}

export async function getScimGroup(orgId: string, groupId: string) {
  return prisma.group.findFirst({
    where: { id: groupId, orgId },
    ...groupWithMembers,
  });
}

/**
 * Parses the GET /Groups filter. Only `displayName eq "..."` and
 * `externalId eq "..."` are supported, which is what Okta and Entra send.
 * Anything else is rejected rather than ignored, so an IdP never mistakes an
 * unfiltered list for a match.
 */
export function parseGroupFilter(filter: unknown): Prisma.GroupWhereInput {
  if (filter === undefined || filter === "") return {};
  if (typeof filter !== "string") {
    throw new ScimError(400, "Invalid filter", "invalidFilter");
  }
  const match = filter
    .trim()
    .match(/^(displayName|externalId)\s+eq\s+"((?:[^"\\]|\\.)*)"$/i);
  if (!match) {
    throw new ScimError(
      400,
      'Unsupported filter. Supported: displayName eq "..." and externalId eq "..."',
      "invalidFilter",
    );
  }
  const value = match[2].replace(/\\(.)/g, "$1");
  return match[1].toLowerCase() === "displayname"
    ? { displayName: value }
    : { externalId: value };
}

export async function listScimGroups(params: {
  orgId: string;
  where: Prisma.GroupWhereInput;
  startIndex: number;
  count: number;
}) {
  const where = { ...params.where, orgId: params.orgId };
  const [totalResults, groups] = await Promise.all([
    prisma.group.count({ where }),
    prisma.group.findMany({
      where,
      // Stable order so IdPs paging with startIndex never skip or repeat.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: params.startIndex - 1,
      take: params.count,
      ...groupWithMembers,
    }),
  ]);
  return { totalResults, groups };
}

export function toListResponse(
  groups: ScimGroupWithMembers[],
  totalResults: number,
  startIndex: number,
  excludeMembers: boolean,
) {
  return {
    schemas: [SCIM_LIST_RESPONSE_SCHEMA],
    totalResults,
    startIndex,
    itemsPerPage: groups.length,
    Resources: groups.map((group) => toScimGroup(group, { excludeMembers })),
  };
}

// --- Members -----------------------------------------------------------------

/** Accepts a single member object or an array of them; returns the user ids. */
function parseMemberIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as { value?: unknown }).value !== "string"
    ) {
      throw new ScimError(
        400,
        "Each member must be an object with a string 'value' (the SCIM User id)",
        "invalidValue",
      );
    }
    return (item as { value: string }).value;
  });
}

type Tx = Prisma.TransactionClient;

/** Resolves user ids to org memberships; rejects ids that are not in the org. */
async function resolveOrgMemberships(
  tx: Tx,
  orgId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const memberships = await tx.organizationMembership.findMany({
    where: { orgId, userId: { in: unique } },
    select: { id: true, userId: true },
  });
  const byUserId = new Map(memberships.map((m) => [m.userId, m.id]));
  const missing = unique.filter((id) => !byUserId.has(id));
  if (missing.length > 0) {
    throw new ScimError(
      400,
      `Members not found in organization: ${missing.join(", ")}. Provision the users via /Users first.`,
      "invalidValue",
    );
  }
  return byUserId;
}

async function addMembers(
  tx: Tx,
  orgId: string,
  groupId: string,
  userIds: string[],
) {
  const memberships = await resolveOrgMemberships(tx, orgId, userIds);
  if (memberships.size === 0) return;
  await tx.groupMembership.createMany({
    data: [...memberships.values()].map((orgMembershipId) => ({
      groupId,
      orgMembershipId,
    })),
    skipDuplicates: true,
  });
}

async function removeMembers(tx: Tx, groupId: string, userIds: string[]) {
  if (userIds.length === 0) return;
  await tx.groupMembership.deleteMany({
    where: { groupId, organizationMembership: { userId: { in: userIds } } },
  });
}

async function replaceMembers(
  tx: Tx,
  orgId: string,
  groupId: string,
  userIds: string[],
) {
  // Validate before deleting so a bad id never leaves the group half-emptied.
  await resolveOrgMemberships(tx, orgId, userIds);
  await tx.groupMembership.deleteMany({
    where: {
      groupId,
      organizationMembership: { userId: { notIn: [...new Set(userIds)] } },
    },
  });
  await addMembers(tx, orgId, groupId, userIds);
}

// --- Writes ------------------------------------------------------------------

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new ScimError(400, `'${name}' must be a string`, "invalidValue");
  }
  return value;
}

function requireDisplayName(value: unknown): string {
  const displayName = optionalString(value, "displayName")?.trim();
  if (!displayName) {
    throw new ScimError(400, "displayName is required", "invalidValue");
  }
  return displayName;
}

function rethrowUniqueness(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new ScimError(
      409,
      "A group with this externalId already exists in the organization",
      "uniqueness",
    );
  }
  throw error;
}

export async function createScimGroup(
  orgId: string,
  body: Record<string, unknown>,
) {
  const displayName = requireDisplayName(body.displayName);
  const externalId = optionalString(body.externalId, "externalId");
  const memberIds = parseMemberIds(body.members);

  try {
    const groupId = await prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: { orgId, displayName, externalId },
      });
      await addMembers(tx, orgId, group.id, memberIds);
      return group.id;
    });
    return (await getScimGroup(orgId, groupId))!;
  } catch (error) {
    rethrowUniqueness(error);
  }
}

/** PUT replaces the group: displayName, externalId and the full member list. */
export async function replaceScimGroup(
  orgId: string,
  groupId: string,
  body: Record<string, unknown>,
) {
  const displayName = requireDisplayName(body.displayName);
  const externalId = optionalString(body.externalId, "externalId") ?? null;
  const memberIds = parseMemberIds(body.members);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.group.update({
        where: { id: groupId, orgId },
        data: { displayName, externalId },
      });
      await replaceMembers(tx, orgId, groupId, memberIds);
    });
  } catch (error) {
    rethrowUniqueness(error);
  }
  return (await getScimGroup(orgId, groupId))!;
}

const MEMBER_FILTER_PATH = /^members\[\s*value\s+eq\s+"([^"]+)"\s*\]$/i;

type PatchOperation = { op?: unknown; path?: unknown; value?: unknown };

export async function patchScimGroup(
  orgId: string,
  groupId: string,
  body: Record<string, unknown>,
) {
  if (
    !Array.isArray(body.schemas) ||
    !body.schemas.includes(SCIM_PATCH_OP_SCHEMA)
  ) {
    throw new ScimError(
      400,
      `Request body must include 'schemas' with '${SCIM_PATCH_OP_SCHEMA}'`,
      "invalidSyntax",
    );
  }
  if (!Array.isArray(body.Operations)) {
    throw new ScimError(
      400,
      "Request body must include an 'Operations' array",
      "invalidSyntax",
    );
  }
  const operations = body.Operations as PatchOperation[];

  try {
    await prisma.$transaction(async (tx) => {
      for (const operation of operations) {
        await applyPatchOperation(tx, orgId, groupId, operation);
      }
      // Bump lastModified even when only memberships changed.
      await tx.group.update({
        where: { id: groupId, orgId },
        data: { updatedAt: new Date() },
      });
    });
  } catch (error) {
    rethrowUniqueness(error);
  }
  return (await getScimGroup(orgId, groupId))!;
}

async function applyPatchOperation(
  tx: Tx,
  orgId: string,
  groupId: string,
  operation: PatchOperation,
) {
  const op = typeof operation.op === "string" ? operation.op.toLowerCase() : "";
  if (!["add", "remove", "replace"].includes(op)) {
    throw new ScimError(
      400,
      `Unsupported PATCH op: ${String(operation.op)}`,
      "invalidSyntax",
    );
  }
  const path =
    typeof operation.path === "string" ? operation.path.trim() : undefined;

  // Pathless: value is a partial group, e.g. Okta's
  // { op: "replace", value: { displayName, members } }.
  if (!path) {
    if (op === "remove") {
      throw new ScimError(400, "remove requires a path", "noTarget");
    }
    const value = operation.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ScimError(
        400,
        "A PATCH op without path must have an object value",
        "invalidValue",
      );
    }
    const attrs = value as Record<string, unknown>;
    if ("displayName" in attrs) {
      await tx.group.update({
        where: { id: groupId, orgId },
        data: { displayName: requireDisplayName(attrs.displayName) },
      });
    }
    if ("externalId" in attrs) {
      await tx.group.update({
        where: { id: groupId, orgId },
        data: {
          externalId: optionalString(attrs.externalId, "externalId") ?? null,
        },
      });
    }
    if ("members" in attrs) {
      const memberIds = parseMemberIds(attrs.members);
      if (op === "add") await addMembers(tx, orgId, groupId, memberIds);
      else await replaceMembers(tx, orgId, groupId, memberIds);
    }
    // Other attributes are accepted and ignored, as IdPs send attributes we
    // do not store and rejecting them breaks provisioning.
    return;
  }

  const filteredMember = path.match(MEMBER_FILTER_PATH);
  if (filteredMember) {
    if (op !== "remove") {
      throw new ScimError(
        400,
        "Only 'remove' is supported on a filtered members path",
        "invalidPath",
      );
    }
    await removeMembers(tx, groupId, [filteredMember[1]]);
    return;
  }

  switch (path.toLowerCase()) {
    case "members": {
      if (op === "add") {
        await addMembers(tx, orgId, groupId, parseMemberIds(operation.value));
      } else if (op === "replace") {
        await replaceMembers(
          tx,
          orgId,
          groupId,
          parseMemberIds(operation.value),
        );
      } else if (operation.value === undefined || operation.value === null) {
        // remove without value clears the group (RFC 7644 3.5.2.2)
        await tx.groupMembership.deleteMany({ where: { groupId } });
      } else {
        // Entra: { op: "Remove", path: "members", value: [{ value: id }] }
        await removeMembers(tx, groupId, parseMemberIds(operation.value));
      }
      return;
    }
    case "displayname": {
      if (op === "remove") {
        throw new ScimError(400, "displayName cannot be removed", "mutability");
      }
      await tx.group.update({
        where: { id: groupId, orgId },
        data: { displayName: requireDisplayName(operation.value) },
      });
      return;
    }
    case "externalid": {
      await tx.group.update({
        where: { id: groupId, orgId },
        data: {
          externalId:
            op === "remove"
              ? null
              : (optionalString(operation.value, "externalId") ?? null),
        },
      });
      return;
    }
    default:
      throw new ScimError(
        400,
        `Unsupported PATCH path: ${path}`,
        "invalidPath",
      );
  }
}

export async function deleteScimGroup(orgId: string, groupId: string) {
  await prisma.group.delete({ where: { id: groupId, orgId } });
}

/** Writes a ScimError, or logs and writes a 500 for anything else. */
export function handleScimGroupsError(
  res: NextApiResponse,
  error: unknown,
  context: string,
) {
  if (error instanceof ScimError) {
    logger.warn(`[SCIM] ${context}: ${error.detail}`);
    return writeScimErrorResponse(
      res,
      error.status,
      error.detail,
      error.scimType,
    );
  }
  logger.error(`[SCIM] ${context}`, error);
  return writeScimErrorResponse(res, 500, "Internal server error");
}
