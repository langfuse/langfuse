import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { type User } from "@langfuse/shared";
import { logger, redis } from "@langfuse/shared/src/server";

import { type NextApiRequest, type NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (!["GET", "DELETE", "PATCH"].includes(req.method || "")) {
    logger.error(
      `Method not allowed for ${req.method} on /api/public/scim/Users/[id]`,
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
    `Received request for /api/public/scim/Users/[id] with method ${req.method} for orgId ${authCheck.scope.orgId} and userId ${req.query.id}`,
  );

  const orgMembership = await prisma.organizationMembership.findFirst({
    where: {
      orgId: authCheck.scope.orgId,
      user: {
        id: req.query.id as string,
      },
    },
    select: {
      id: true,
      user: true,
    },
  });

  if (!orgMembership?.user) {
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
        return handlePatch(req, res, orgMembership.user, authCheck.scope.orgId);
      case "GET":
        return handleGet(req, res, orgMembership.user);
      case "DELETE":
        return handleDelete(
          req,
          res,
          orgMembership.user,
          authCheck.scope.orgId,
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
      `Error handling SCIM user ${req.query.id} for ${req.method}`,
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
) {
  // Transform to SCIM format
  return res.status(200).json({
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
) {
  let body = req.body;

  // Check if body is a string and parse it
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      logger.warn("Failed to parse JSON body", error);
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
      "Invalid request body. Must include 'schemas' with 'urn:ietf:params:scim:api:messages:2.0:PatchOp'.",
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
      "Invalid request body. Must include 'Operations' array with at least one operation.",
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
        // Provision the user by adding them to the organization
        await prisma.organizationMembership.upsert({
          where: {
            orgId_userId: {
              orgId: orgId,
              userId: user.id,
            },
          },
          create: {
            userId: user.id,
            orgId: orgId,
            role: "NONE",
          },
          update: {},
        });
      } else {
        // Deprovision the user by removing them from the organization
        await prisma.organizationMembership.deleteMany({
          where: {
            userId: user.id,
            orgId: orgId,
          },
        });
      }
    } else {
      logger.error(
        "Unsupported operation or invalid value in request body. Only 'replace' with 'active' field is supported.",
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

  return handleGet(req, res, user);
}

// DELETE - Remove user from organization
async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  user: User,
  orgId: string,
) {
  // Delete just removes the user from the organization
  await prisma.organizationMembership.deleteMany({
    where: {
      userId: user.id,
      orgId: orgId,
    },
  });

  // Return empty response with 204 No Content.
  return res.status(204).end();
}
