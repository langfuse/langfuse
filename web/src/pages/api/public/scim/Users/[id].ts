import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { Prisma, prisma, type User, type Role } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { z } from "zod";
import { type NextApiRequest, type NextApiResponse } from "next";

// Parse the first valid role from a SCIM `roles` array. Returns undefined when
// the attribute is absent, empty, or unparseable, which the provisioning logic
// treats as "no explicit role requested".
function parseScimRole(roles: unknown): Role | undefined {
  if (!Array.isArray(roles) || roles.length === 0) {
    return undefined;
  }
  const parsed = z
    .array(z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER", "NONE"]))
    .safeParse(roles);
  return parsed.success ? parsed.data[0] : undefined;
}

type ProvisionOutcome =
  | { kind: "created"; role: Role }
  | { kind: "updated"; role: Role }
  | { kind: "unchanged"; role: Role };

// Provision a user into an organization in response to a SCIM `active: true`.
//
// Behaviour:
// - role provided  → set the membership to that role (create if missing,
//   update if it differs). An explicit role is always honoured.
// - role omitted    → create the membership with the default NONE role when it
//   is missing, but leave an existing membership untouched. This is what keeps
//   a periodic IdP full-sync (which omits roles) from resetting a member's role
//   back to NONE.
//
// Writes an audit log entry only when state actually changes (create/update),
// never for a no-op.
async function provisionMembership({
  userId,
  orgId,
  apiKeyId,
  role,
}: {
  userId: string;
  orgId: string;
  apiKeyId: string;
  role?: Role;
}): Promise<ProvisionOutcome> {
  const applyToExisting = async (existing: {
    id: string;
    role: Role;
  }): Promise<ProvisionOutcome> => {
    // No explicit role requested, or the role is unchanged → leave as-is.
    if (role === undefined || role === existing.role) {
      return { kind: "unchanged", role: existing.role };
    }
    const updated = await prisma.organizationMembership.update({
      where: { orgId_userId: { orgId, userId } },
      data: { role },
    });
    await auditLog({
      resourceType: "orgMembership",
      resourceId: updated.id,
      action: "update",
      before: existing,
      after: updated,
      apiKeyId,
      orgId,
    });
    return { kind: "updated", role };
  };

  const existing = await prisma.organizationMembership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (existing) {
    return applyToExisting(existing);
  }

  // Missing → create with the explicit role when provided, otherwise NONE.
  const roleToCreate: Role = role ?? "NONE";
  try {
    const created = await prisma.organizationMembership.create({
      data: { userId, orgId, role: roleToCreate },
    });
    await auditLog({
      resourceType: "orgMembership",
      resourceId: created.id,
      action: "create",
      after: created,
      apiKeyId,
      orgId,
    });
    return { kind: "created", role: roleToCreate };
  } catch (error) {
    // A concurrent provisioning request created the row first. Re-read it and
    // apply the requested role (if any), keeping the periodic sync idempotent.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const current = await prisma.organizationMembership.findUnique({
        where: { orgId_userId: { orgId, userId } },
      });
      if (current) {
        return applyToExisting(current);
      }
      return { kind: "unchanged", role: roleToCreate };
    }
    throw error;
  }
}

// Single place for the SCIM provisioning log line so PUT and PATCH stay
// consistent.
function logScimProvision(
  outcome: ProvisionOutcome,
  userId: string,
  orgId: string,
  via: "PUT" | "PATCH",
) {
  switch (outcome.kind) {
    case "created":
      logger.info(
        `[SCIM] Provisioned user ${userId} in org ${orgId} with role ${outcome.role} via ${via}`,
      );
      break;
    case "updated":
      logger.info(
        `[SCIM] Updated role for user ${userId} in org ${orgId} to ${outcome.role} via ${via}`,
      );
      break;
    case "unchanged":
      logger.info(
        `[SCIM] User ${userId} already a member of org ${orgId}; no changes via ${via}`,
      );
      break;
  }
}

// Mirrors the tRPC `deleteMembership` invariant. Wraps the owner-count check
// and the membership delete in a single Serializable transaction so two
// concurrent SCIM deprovision requests cannot both pass the guard and orphan
// the org. Returns false (with the response already written) when the caller
// must stop; returns true after the membership has been removed.
async function deprovisionOrReject(
  res: NextApiResponse,
  userId: string,
  orgId: string,
  apiKeyId: string,
): Promise<boolean> {
  try {
    const outcome = await prisma.$transaction(
      async (tx) => {
        const membership = await tx.organizationMembership.findUnique({
          where: { orgId_userId: { orgId, userId } },
        });
        // Already absent: nothing to delete. Idempotent success, no audit.
        if (!membership) {
          return { result: "noop" as const };
        }
        if (membership.role === "OWNER") {
          const ownerCount = await tx.organizationMembership.count({
            where: { orgId, role: "OWNER" },
          });
          if (ownerCount <= 1) {
            return { result: "lastOwner" as const };
          }
        }
        await tx.organizationMembership.delete({
          where: { orgId_userId: { orgId, userId } },
        });
        return { result: "deleted" as const, membership };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (outcome.result === "lastOwner") {
      logger.warn(
        `[SCIM] Refused to remove last OWNER ${userId} from org ${orgId}`,
      );
      res.status(403).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail:
          "Cannot remove the last owner of an organization. Assign new owner or delete organization.",
        status: 403,
      });
      return false;
    }

    // Only audit when a membership was actually removed.
    if (outcome.result === "deleted") {
      await auditLog({
        resourceType: "orgMembership",
        resourceId: outcome.membership.id,
        action: "delete",
        before: outcome.membership,
        apiKeyId,
        orgId,
      });
    }
    return true;
  } catch (error) {
    // Postgres maps a serialization failure to Prisma error code P2034 ("could
    // not serialize access due to concurrent update"). Surface as 409 so the
    // SCIM client retries; on retry the guard will see the updated owner count.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      logger.warn(
        `[SCIM] Concurrent deprovision conflict for user ${userId} in org ${orgId}`,
      );
      res.status(409).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Concurrent deprovision conflict for this user. Please retry.",
        status: 409,
      });
      return false;
    }
    throw error;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (!["GET", "DELETE", "PATCH", "PUT"].includes(req.method || "")) {
    logger.error(
      `[SCIM] Method not allowed for ${req.method} on /api/public/scim/Users/[id]`,
    );
    return res.status(405).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail: "Method not allowed",
      status: 405,
    });
  }

  // CHECK AUTH
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
  if (!authCheck.validKey) {
    return res.status(401).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail: authCheck.error,
      status: 401,
    });
  }
  // END CHECK AUTH

  // Check if using an organization API key
  if (
    authCheck.scope.accessLevel !== "organization" ||
    !authCheck.scope.orgId
  ) {
    return res.status(403).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail:
        "Invalid API key. Organization-scoped API key required for this operation.",
      status: 403,
    });
  }

  logger.info(
    `[SCIM] Received request for /api/public/scim/Users/[id] with method ${req.method} for orgId ${authCheck.scope.orgId} and userId ${req.query.id}`,
  );

  // First, check if the user exists in the system at all
  const user = await prisma.user.findUnique({
    where: {
      id: req.query.id as string,
    },
  });

  if (!user) {
    return res.status(404).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail: "User not found",
      status: 404,
    });
  }

  // Route to the appropriate handler based on HTTP method
  try {
    switch (req.method) {
      case "PATCH":
        return handlePatch(
          req,
          res,
          user,
          authCheck.scope.orgId,
          authCheck.scope.apiKeyId,
        );
      case "PUT":
        return handlePut(
          req,
          res,
          user,
          authCheck.scope.orgId,
          authCheck.scope.apiKeyId,
        );
      case "GET":
        return handleGet(req, res, user, authCheck.scope.orgId);
      case "DELETE":
        return handleDelete(
          req,
          res,
          user,
          authCheck.scope.orgId,
          authCheck.scope.apiKeyId,
        );
      default:
        // This should never happen due to the check at the beginning
        return res.status(405).json({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "Method not allowed",
          status: 405,
        });
    }
  } catch (error) {
    logger.error(
      `[SCIM] Error handling user ${req.query.id} for ${req.method}`,
      error,
    );
    return res.status(500).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail: "Internal server error",
      status: 500,
    });
  }
}

// GET - Retrieve a specific user
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  user: User,
  orgId: string,
) {
  // For GET operations, verify the user is a member of the organization
  const orgMembership = await prisma.organizationMembership.findFirst({
    where: {
      orgId: orgId,
      userId: user.id,
    },
  });

  if (!orgMembership) {
    return res.status(404).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail: "User not found in organization",
      status: 404,
    });
  }

  // Transform to SCIM format
  // With NextJS 15, we can't return NextApiResponse objects anymore
  res.status(200).json({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: user.id,
    userName: user.email,
    name: {
      formatted: user.name,
    },
    emails: [
      {
        primary: true,
        value: user.email,
        type: "work",
      },
    ],
    meta: {
      resourceType: "User",
      created: user.createdAt?.toISOString(),
      lastModified: user.updatedAt?.toISOString(),
    },
  });
}

// PATCH - Update user details (Use only for deprovisioning for now)
// Payload is a string like: "{\"schemas\":[\"urn:ietf:params:scim:api:messages:2.0:PatchOp\"],\"Operations\":[{\"op\":\"replace\",\"value\":{\"active\":false}}]}"
async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  user: User,
  orgId: string,
  apiKeyId: string,
) {
  let body = req.body;

  // Check if body is a string and parse it
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      logger.warn("[SCIM] Failed to parse JSON body", error);
      return res.status(400).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Invalid JSON body",
        status: 400,
      });
    }
  }

  // Validate the request body
  if (
    !body.schemas ||
    !Array.isArray(body.schemas) ||
    !body.schemas.includes("urn:ietf:params:scim:api:messages:2.0:PatchOp")
  ) {
    logger.warn(
      "[SCIM] Invalid request body. Must include 'schemas' with 'urn:ietf:params:scim:api:messages:2.0:PatchOp'.",
      body,
    );
    return res.status(400).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail:
        "Invalid request body. Must include 'schemas' with 'urn:ietf:params:scim:api:messages:2.0:PatchOp'.",
      status: 400,
    });
  }

  // Check for operations
  if (!body.Operations || !Array.isArray(body.Operations)) {
    logger.warn(
      "[SCIM] Invalid request body. Must include 'Operations' array with at least one operation.",
      body,
    );
    return res.status(400).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail:
        "Invalid request body. Must include 'Operations' array with at least one operation.",
      status: 400,
    });
  }

  // Process each operation
  for (const op of body.Operations) {
    if (
      op.op === "replace" &&
      op.value &&
      typeof op.value.active === "boolean"
    ) {
      if (op.value.active) {
        // PATCH PatchOp values only carry `active` (no roles), so this always
        // creates a NONE membership when missing and is a no-op otherwise.
        const outcome = await provisionMembership({
          userId: user.id,
          orgId,
          apiKeyId,
        });
        logScimProvision(outcome, user.id, orgId, "PATCH");
      } else {
        // Deprovision atomically: check + delete in one Serializable txn.
        if (!(await deprovisionOrReject(res, user.id, orgId, apiKeyId))) {
          return;
        }
        logger.info(
          `[SCIM] Deprovisioned user ${user.id} from org ${orgId} via PATCH`,
        );
      }
    } else {
      logger.error(
        "[SCIM] Unsupported operation or invalid value in request body. Only 'replace' with 'active' field is supported.",
        op,
      );
      return res.status(400).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail:
          "Unsupported operation or invalid value in request body. Only 'replace' with 'active' field is supported.",
        status: 400,
      });
    }
  }
  // With NextJS 15, we can't return NextApiResponse objects anymore
  await handleGet(req, res, user, orgId);
}

// PUT - Update user details
async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  user: User,
  orgId: string,
  apiKeyId: string,
) {
  let body = req.body;

  // Check if body is a string and parse it
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      logger.warn("[SCIM] Failed to parse JSON body", error);
      return res.status(400).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Invalid JSON body",
        status: 400,
      });
    }
  }

  // Validate that it's a SCIM user object
  if (
    !body.schemas ||
    !Array.isArray(body.schemas) ||
    !body.schemas.includes("urn:ietf:params:scim:schemas:core:2.0:User")
  ) {
    logger.warn(
      "[SCIM] Invalid request body. Must include 'schemas' with 'urn:ietf:params:scim:schemas:core:2.0:User'.",
      body,
    );
    return res.status(400).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail:
        "Invalid request body. Must include 'schemas' with 'urn:ietf:params:scim:schemas:core:2.0:User'.",
      status: 400,
    });
  }

  // Handle active status for provisioning/deprovisioning.
  //
  // `active: true` ensures the user is provisioned. An explicit `roles` value is
  // honoured (the membership is created or updated to that role). When `roles`
  // is omitted we create a default NONE membership if one is missing but leave
  // an existing membership untouched — so a periodic IdP full-sync that omits
  // roles cannot reset an existing member's role back to NONE.
  if (typeof body.active === "boolean") {
    if (body.active) {
      const outcome = await provisionMembership({
        userId: user.id,
        orgId,
        apiKeyId,
        role: parseScimRole(body.roles),
      });
      logScimProvision(outcome, user.id, orgId, "PUT");
    } else {
      // Deprovision atomically: check + delete in one Serializable txn.
      if (!(await deprovisionOrReject(res, user.id, orgId, apiKeyId))) {
        return;
      }
      logger.info(
        `[SCIM] Deprovisioned user ${user.id} from org ${orgId} via PUT`,
      );
    }
  }

  // For PUT operations, we could also update other user attributes like name
  // if they are provided in the request body. For now, matching the existing
  // feature set which only handles active status changes.

  // Return SCIM formatted user (abbreviated)
  // With NextJS 15, we can't return NextApiResponse objects anymore
  res.status(200).json({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: user.id,
    userName: user.email,
    meta: {
      resourceType: "User",
      created: user.createdAt?.toISOString(),
      lastModified: user.updatedAt?.toISOString(),
    },
  });
}

// DELETE - Remove user from organization
async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  user: User,
  orgId: string,
  apiKeyId: string,
) {
  // Deprovision atomically: check + delete in one Serializable txn.
  if (!(await deprovisionOrReject(res, user.id, orgId, apiKeyId))) {
    return;
  }
  logger.info(`[SCIM] Removed user ${user.id} from org ${orgId} via DELETE`);

  // Return empty response with 204 No Content.
  // With NextJS 15, we can't return NextApiResponse objects anymore
  res.status(204).end();
}
