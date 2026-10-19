import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma, type User, type Role } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { isBaseError } from "@langfuse/shared";
import { z } from "zod";
import { type NextApiRequest, type NextApiResponse } from "next";
import { authenticator } from "@/src/features/apiKey/server";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import {
  applyOrgMembership,
  removeOrgMember,
} from "@/src/features/memberships/server/membershipService";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server";
import { shadowAuth, writeScimError } from "@/src/features/public-api/server";

// Parse the first valid role from a SCIM `roles` array. Returns undefined when
// the attribute is absent, empty, or unparsable, which the provisioning logic
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

type ProvisionOutcome = {
  kind: "created" | "updated" | "unchanged";
  role: Role;
};

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
// The membership service audits and syncs to SFDC only when state actually
// changes, never for a no-op, so a periodic IdP full-sync that re-PUTs every
// member does not ping SFDC on every cycle.
async function provisionMembership({
  userId,
  orgId,
  role,
  ctx,
}: {
  userId: string;
  orgId: string;
  role?: Role;
  ctx: AuthorizationContext;
}): Promise<ProvisionOutcome> {
  const { outcome, after } = await applyOrgMembership(ctx, {
    orgId,
    userId,
    role: role ?? "NONE",
    keepExistingRole: role === undefined,
  });
  return {
    kind: outcome === "removed" ? "unchanged" : outcome,
    role: after!.role,
  };
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

// Removes the membership, refusing to remove the last owner. Idempotent: an
// absent membership is a successful no-op.
async function deprovisionOrReject(
  userId: string,
  orgId: string,
  ctx: AuthorizationContext,
): Promise<void> {
  await removeOrgMember(ctx, { orgId, userId });
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
  const authCheck = await shadowAuth({
    req,
    action:
      req.method === "GET"
        ? "organizationMembers:read"
        : "organizationMembers:CUD",
    allowedAccessLevels: ["organization"],
  });
  if (!authCheck.success) {
    return writeScimError(res, authCheck.error);
  }
  // END CHECK AUTH

  // Gate SCIM provisioning behind the `admin-api` entitlement, matching the
  // sibling organization admin endpoints (memberships, projects, apiKeys).
  // Without this, any org-scoped key could mutate memberships and roles on
  // plans that do not include the feature.
  if (
    !hasEntitlementBasedOnPlan({
      plan: authCheck.scope.plan,
      entitlement: "admin-api",
    })
  ) {
    return res.status(403).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail: "This feature is not available on your current plan.",
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
    let ctx = authCheck.ctx;
    if (!ctx && req.method !== "GET") {
      const authentication = await authenticator.authenticate({
        headers: req.headers,
      });
      if (!authentication.success) {
        return writeScimError(res, authentication.error);
      }
      ctx = authentication.context;
    }
    switch (req.method) {
      case "PATCH":
        return await handlePatch(req, res, user, authCheck.scope.orgId, ctx!);
      case "PUT":
        return await handlePut(req, res, user, authCheck.scope.orgId, ctx!);
      case "GET":
        return handleGet(req, res, user, authCheck.scope.orgId);
      case "DELETE":
        return await handleDelete(req, res, user, authCheck.scope.orgId, ctx!);
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
    if (isBaseError(error)) {
      return writeScimError(res, error);
    }
    return res.status(500).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail: "Internal server error",
      status: 500,
    });
  }
}

// Resolve the caller organization's membership for `userId`. When the user is
// not a member, write a 404 that never echoes any of the user's attributes and
// return null.
async function requireOrgMembership(
  res: NextApiResponse,
  orgId: string,
  userId: string,
) {
  const orgMembership = await prisma.organizationMembership.findFirst({
    where: { orgId, userId },
  });
  if (!orgMembership) {
    res.status(404).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail: "User not found in organization",
      status: 404,
    });
    return null;
  }
  return orgMembership;
}

// GET - Retrieve a specific user
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  user: User,
  orgId: string,
) {
  // For GET operations, verify the user is a member of the organization.
  if (!(await requireOrgMembership(res, orgId, user.id))) {
    return;
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
  ctx: AuthorizationContext,
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
          ctx,
        });
        logScimProvision(outcome, user.id, orgId, "PATCH");
      } else {
        // Deprovision atomically: the last-owner check and delete share one lock.
        await deprovisionOrReject(user.id, orgId, ctx);
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
  ctx: AuthorizationContext,
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

  // A caller may only observe or mutate a user already tied to their
  // organization. The sole exception is provisioning (active:true), which
  // legitimately references a global user id in order to add the user.
  const isProvisioning = body.active === true;
  if (!isProvisioning && !(await requireOrgMembership(res, orgId, user.id))) {
    return;
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
        role: parseScimRole(body.roles),
        ctx,
      });
      logScimProvision(outcome, user.id, orgId, "PUT");
    } else {
      // Deprovision atomically: the last-owner check and delete share one lock.
      await deprovisionOrReject(user.id, orgId, ctx);
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
  ctx: AuthorizationContext,
) {
  if (!(await requireOrgMembership(res, orgId, user.id))) {
    return;
  }
  // Deprovision atomically: the last-owner check and delete share one lock.
  await deprovisionOrReject(user.id, orgId, ctx);
  logger.info(`[SCIM] Removed user ${user.id} from org ${orgId} via DELETE`);

  // Return empty response with 204 No Content.
  // With NextJS 15, we can't return NextApiResponse objects anymore
  res.status(204).end();
}
