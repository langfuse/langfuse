import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { Prisma, prisma, type User } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { type NextApiRequest, type NextApiResponse } from "next";

// SCIM `active: true` (PUT/PATCH) is an idempotent "ensure provisioned" signal,
// not a role assignment. If the membership is missing we create it with the
// default NONE role; if it already exists we leave its role untouched so a
// roleless IdP sync cannot silently downgrade an existing member. Returns true
// only when a membership was actually created, so callers audit real changes
// and skip no-ops.
async function provisionMembershipIfMissing({
  userId,
  orgId,
  apiKeyId,
}: {
  userId: string;
  orgId: string;
  apiKeyId: string;
}): Promise<boolean> {
  const existing = await prisma.organizationMembership.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { id: true },
  });
  if (existing) {
    return false;
  }
  try {
    const created = await prisma.organizationMembership.create({
      data: { userId, orgId, role: "NONE" },
    });
    await auditLog({
      resourceType: "orgMembership",
      resourceId: created.id,
      action: "create",
      after: created,
      apiKeyId,
      orgId,
    });
    return true;
  } catch (error) {
    // A concurrent provisioning request created the row first. Treat the
    // unique-constraint violation (P2002) as a successful no-op so the
    // periodic IdP full-sync stays idempotent.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false;
    }
    throw error;
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
        // Ensure the membership exists with the default NONE role; never
        // modify an existing membership's role.
        const created = await provisionMembershipIfMissing({
          userId: user.id,
          orgId,
          apiKeyId,
        });
        logger.info(
          created
            ? `[SCIM] Provisioned user ${user.id} in org ${orgId} with role NONE via PATCH`
            : `[SCIM] User ${user.id} already a member of org ${orgId}; no changes via PATCH`,
        );
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
  // `active: true` is an idempotent "ensure provisioned" signal, not a role
  // assignment: we create the membership with the default NONE role when it is
  // missing and make no changes when it already exists. Any `roles` in the
  // payload are intentionally ignored here so that a periodic IdP full-sync
  // (which typically omits roles) cannot downgrade an existing member's role.
  // Role changes go through the create (POST) flow or the in-app UI.
  if (typeof body.active === "boolean") {
    if (body.active) {
      const created = await provisionMembershipIfMissing({
        userId: user.id,
        orgId,
        apiKeyId,
      });
      logger.info(
        created
          ? `[SCIM] Provisioned user ${user.id} in org ${orgId} with role NONE via PUT`
          : `[SCIM] User ${user.id} already a member of org ${orgId}; no changes via PUT`,
      );
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
