import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { logger } from "@langfuse/shared/src/server";
import { shadowAuth } from "@/src/features/public-api/server/shadowAuth";
import { writeScimError } from "@/src/features/public-api/server/writeError";

import { type NextApiRequest, type NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (req.method !== "GET") {
    logger.error(
      `[SCIM] Method not allowed for ${req.method} on /api/public/scim/ResourceTypes`,
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
    action: "organizationMembers:read",
    allowedAccessLevels: ["organization"],
  });
  if (!authCheck.success) {
    return writeScimError(res, authCheck.error);
  }
  // END CHECK AUTH

  // Return the resource types
  return res.status(200).json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: 1,
    Resources: [
      {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
        id: "User",
        name: "User",
        endpoint: "/api/public/scim/Users",
        description: "User Account",
        schema: "urn:ietf:params:scim:schemas:core:2.0:User",
        schemaExtensions: [],
        meta: {
          resourceType: "ResourceType",
          location: "/api/public/scim/ResourceTypes/User",
        },
      },
    ],
  });
}
