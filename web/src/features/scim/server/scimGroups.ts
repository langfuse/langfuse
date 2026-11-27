import { type NextApiRequest, type NextApiResponse } from "next";
import { GroupSource, Prisma, prisma } from "@langfuse/shared/src/db";
import { escapeSqlLikePattern, logger } from "@langfuse/shared/src/server";
import { evictUserAccessCaches } from "@/src/features/rbac/server/evictUserAccessCaches";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { hasEntitlementBasedOnPlan } from "@langfuse/shared";
import { shadowAuth } from "@/src/features/public-api/server/shadowAuth";
import { writeScimError } from "@/src/features/public-api/server/writeError";
import {
  addGroupMembers,
  deleteGroup,
  groupMemberUserIds,
  GroupMembersNotInOrgError,
  lockGroup,
  removeGroupMembers,
  replaceGroupMembers,
} from "@/src/features/groups/server/groupService";
import { auditLog } from "@/src/features/audit-logs/auditLog";

// SCIM 2.0 Groups (RFC 7643 4.2, RFC 7644 3) as sent by Okta and Entra ID. Never touches role assignments;
// MANUAL and SYSTEM groups are invisible to SCIM.

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

/** Returns null when an error response has already been written. */
export async function authorizeScimGroupsRequest(
  req: NextApiRequest,
  res: NextApiResponse,
  { route, methods }: { route: string; methods: string[] },
): Promise<{ orgId: string; apiKeyId: string } | null> {
  await runMiddleware(req, res, cors);

  if (!methods.includes(req.method ?? "")) {
    logger.error(`[SCIM] Method not allowed for ${req.method} on ${route}`);
    writeScimErrorResponse(res, 405, "Method not allowed");
    return null;
  }

  const authCheck = await shadowAuth({
    req,
    action: req.method === "GET" ? "groups:read" : "groups:CUD",
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

/** Next.js leaves application/scim+json bodies as strings. */
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

type ScimGroupWithMembers = Prisma.GroupGetPayload<typeof groupWithMembers>;

/** changedMemberIds returns the users who joined or left the group between the two states. */
function changedMemberIds(
  before: ScimGroupWithMembers,
  after: ScimGroupWithMembers,
): string[] {
  const ids = (group: ScimGroupWithMembers) =>
    new Set(group.members.map((m) => m.organizationMembership.userId));
  const was = ids(before);
  const is = ids(after);
  return [
    ...[...was].filter((id) => !is.has(id)),
    ...[...is].filter((id) => !was.has(id)),
  ];
}

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

export async function getScimGroup(
  orgId: string,
  groupId: string,
  db: Prisma.TransactionClient = prisma,
) {
  return db.group.findFirst({
    where: { id: groupId, orgId, source: GroupSource.SCIM },
    ...groupWithMembers,
  });
}

/** Supports `displayName eq "..."` and `externalId eq "..."`; rejects anything else. */
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
    ? {
        displayName: {
          equals: escapeSqlLikePattern(value),
          mode: "insensitive",
        },
      }
    : { externalId: value };
}

export async function listScimGroups(params: {
  orgId: string;
  where: Prisma.GroupWhereInput;
  startIndex: number;
  count: number;
}) {
  const where = {
    ...params.where,
    orgId: params.orgId,
    source: GroupSource.SCIM,
  };
  const [totalResults, groups] = await Promise.all([
    prisma.group.count({ where }),
    prisma.group.findMany({
      where,
      // Stable order for paging
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

export type ScimActor = { apiKeyId: string; orgId: string };

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

/** Runs `fn` in a transaction, mapping an externalId collision to a SCIM 409. */
async function transactOrConflict<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(fn);
  } catch (error) {
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
}

export async function createScimGroup(
  actor: ScimActor,
  body: Record<string, unknown>,
) {
  const { orgId } = actor;
  const displayName = requireDisplayName(body.displayName);
  const externalId = optionalString(body.externalId, "externalId");
  const memberIds = parseMemberIds(body.members);

  return transactOrConflict(async (tx) => {
    const group = await tx.group.create({
      data: { orgId, displayName, externalId, source: GroupSource.SCIM },
    });
    await addGroupMembers(tx, { orgId, groupId: group.id, userIds: memberIds });
    const created = (await getScimGroup(orgId, group.id, tx))!;
    await auditLog(
      {
        ...actor,
        resourceType: "group",
        resourceId: group.id,
        action: "create",
        after: toScimGroup(created),
      },
      tx,
    );
    return created;
  });
}

export async function replaceScimGroup(
  actor: ScimActor,
  existing: ScimGroupWithMembers,
  body: Record<string, unknown>,
) {
  const { orgId } = actor;
  const groupId = existing.id;
  const displayName = requireDisplayName(body.displayName);
  const externalId = optionalString(body.externalId, "externalId") ?? null;
  const memberIds = parseMemberIds(body.members);

  const { before, updated } = await transactOrConflict(async (tx) => {
    await lockGroup(tx, groupId);
    const before = (await getScimGroup(orgId, groupId, tx)) ?? existing;
    await tx.group.update({
      where: { id: groupId, orgId },
      data: { displayName, externalId },
    });
    await replaceGroupMembers(tx, { orgId, groupId, userIds: memberIds });
    const updated = (await getScimGroup(orgId, groupId, tx))!;
    await auditLog(
      {
        ...actor,
        resourceType: "group",
        resourceId: groupId,
        action: "update",
        before: toScimGroup(before),
        after: toScimGroup(updated),
      },
      tx,
    );
    return { before, updated };
  });
  await evictUserAccessCaches(prisma, {
    orgId,
    userIds: changedMemberIds(before, updated),
  });
  return updated;
}

const MEMBER_FILTER_PATH = /^members\[\s*value\s+eq\s+"([^"]+)"\s*\]$/i;

type PatchOperation = { op?: unknown; path?: unknown; value?: unknown };

export async function patchScimGroup(
  actor: ScimActor,
  existing: ScimGroupWithMembers,
  body: Record<string, unknown>,
) {
  const { orgId } = actor;
  const groupId = existing.id;
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

  const { before, updated } = await transactOrConflict(async (tx) => {
    await lockGroup(tx, groupId);
    const before = (await getScimGroup(orgId, groupId, tx)) ?? existing;
    for (const operation of operations) {
      await applyPatchOperation(tx, orgId, groupId, operation);
    }
    // Bump lastModified on member-only changes
    await tx.group.update({
      where: { id: groupId, orgId },
      data: { updatedAt: new Date() },
    });
    const updated = (await getScimGroup(orgId, groupId, tx))!;
    await auditLog(
      {
        ...actor,
        resourceType: "group",
        resourceId: groupId,
        action: "update",
        before: toScimGroup(before),
        after: toScimGroup(updated),
      },
      tx,
    );
    return { before, updated };
  });
  await evictUserAccessCaches(prisma, {
    orgId,
    userIds: changedMemberIds(before, updated),
  });
  return updated;
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

  // Pathless (Okta): value is a partial group
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
    await tx.group.update({
      where: { id: groupId, orgId },
      data: {
        ...("displayName" in attrs && {
          displayName: requireDisplayName(attrs.displayName),
        }),
        ...("externalId" in attrs && {
          externalId: optionalString(attrs.externalId, "externalId") ?? null,
        }),
      },
    });
    if ("members" in attrs) {
      const memberIds = parseMemberIds(attrs.members);
      if (op === "add")
        await addGroupMembers(tx, { orgId, groupId, userIds: memberIds });
      else
        await replaceGroupMembers(tx, { orgId, groupId, userIds: memberIds });
    }
    // Ignore other attributes; rejecting them breaks provisioning
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
    await removeGroupMembers(tx, { groupId, userIds: [filteredMember[1]] });
    return;
  }

  switch (path.toLowerCase()) {
    case "members": {
      const userIds =
        operation.value === undefined || operation.value === null
          ? undefined
          : parseMemberIds(operation.value);
      if (op === "add") {
        await addGroupMembers(tx, { orgId, groupId, userIds: userIds ?? [] });
      } else if (op === "replace") {
        await replaceGroupMembers(tx, {
          orgId,
          groupId,
          userIds: userIds ?? [],
        });
      } else {
        // remove without value clears the group (RFC 7644 3.5.2.2)
        await removeGroupMembers(tx, { groupId, userIds });
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

export async function deleteScimGroup(
  actor: ScimActor,
  existing: ScimGroupWithMembers,
) {
  const userIds = await prisma.$transaction(async (tx) => {
    const userIds = await groupMemberUserIds(tx, existing.id);
    const roles = await deleteGroup(tx, {
      id: existing.id,
      orgId: actor.orgId,
      source: GroupSource.SCIM,
    });
    await auditLog(
      {
        ...actor,
        resourceType: "group",
        resourceId: existing.id,
        action: "delete",
        before: { ...toScimGroup(existing), ...roles },
      },
      tx,
    );
    return userIds;
  });
  await evictUserAccessCaches(prisma, { orgId: actor.orgId, userIds });
}

export function handleScimGroupsError(
  res: NextApiResponse,
  error: unknown,
  context: string,
) {
  if (error instanceof GroupMembersNotInOrgError) {
    const detail = `Members not found in organization: ${error.userIds.join(", ")}. Provision the users via /Users first.`;
    logger.warn(`[SCIM] ${context}: ${detail}`);
    return writeScimErrorResponse(res, 400, detail, "invalidValue");
  }
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
