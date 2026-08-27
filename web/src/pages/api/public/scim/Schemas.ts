import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { logger } from "@langfuse/shared/src/server";
import { verifyOrgAuth } from "@/src/features/auth/policy/shadow.direct";

import { type NextApiRequest, type NextApiResponse } from "next";

/** orgKeyRequired is the 403 detail when a non-organization key hits a SCIM endpoint. */
const orgKeyRequired =
  "Invalid API key. Organization-scoped API key required for this operation.";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (req.method !== "GET") {
    logger.error(
      `[SCIM] Method not allowed for ${req.method} on /api/public/scim/Schemas`,
    );
    return res.status(405).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail: "Method not allowed",
      status: 405,
    });
  }

  // CHECK AUTH
  const authCheck = await verifyOrgAuth({
    req,
    name: "SCIM Schemas",
    action: "projects:read",
    scopeDeniedMessage: orgKeyRequired,
  });
  if (!authCheck.validKey) {
    return res.status(authCheck.status).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail: authCheck.error,
      status: authCheck.status,
    });
  }
  // END CHECK AUTH

  // Return the schemas
  return res.status(200).json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    // Only the User schema is advertised; `Resources` has one entry, and RFC
    // 7644 3.4.2 wants `totalResults` to match what was returned. Sibling
    // `/ResourceTypes` already gets this right.
    totalResults: 1,
    Resources: [
      // User Schema
      {
        id: "urn:ietf:params:scim:schemas:core:2.0:User",
        name: "User",
        description: "User Account",
        attributes: [
          {
            name: "id",
            type: "string",
            multiValued: false,
            description: "Unique identifier for the User",
            required: true,
            caseExact: true,
            mutability: "readOnly",
            returned: "always",
            uniqueness: "server",
          },
          {
            name: "userName",
            type: "string",
            multiValued: false,
            description:
              "Unique identifier for the User, typically the email address",
            required: true,
            caseExact: false,
            mutability: "readWrite",
            returned: "always",
            uniqueness: "server",
          },
          {
            name: "name",
            type: "complex",
            multiValued: false,
            description: "The components of the user's name",
            required: false,
            subAttributes: [
              {
                name: "formatted",
                type: "string",
                multiValued: false,
                description: "The user's full name",
                required: false,
                caseExact: false,
                mutability: "readWrite",
                returned: "default",
                uniqueness: "none",
              },
            ],
            mutability: "readWrite",
            returned: "default",
            uniqueness: "none",
          },
          {
            name: "emails",
            type: "complex",
            multiValued: true,
            description: "Email addresses for the user",
            required: false,
            subAttributes: [
              {
                name: "value",
                type: "string",
                multiValued: false,
                description: "Email address value",
                required: false,
                caseExact: false,
                mutability: "readWrite",
                returned: "default",
                uniqueness: "none",
              },
              {
                name: "primary",
                type: "boolean",
                multiValued: false,
                description: "Primary email indicator",
                required: false,
                mutability: "readWrite",
                returned: "default",
                uniqueness: "none",
              },
              {
                name: "type",
                type: "string",
                multiValued: false,
                description: "Email type (work, home, other)",
                required: false,
                caseExact: false,
                mutability: "readWrite",
                returned: "default",
                uniqueness: "none",
              },
            ],
            mutability: "readWrite",
            returned: "default",
            uniqueness: "none",
          },
          {
            name: "meta",
            type: "complex",
            multiValued: false,
            description: "Resource metadata",
            required: false,
            subAttributes: [
              {
                name: "resourceType",
                type: "string",
                multiValued: false,
                description: "The resource type",
                required: false,
                caseExact: true,
                mutability: "readOnly",
                returned: "default",
                uniqueness: "none",
              },
              {
                name: "created",
                type: "dateTime",
                multiValued: false,
                description: "The resource creation time",
                required: false,
                mutability: "readOnly",
                returned: "default",
                uniqueness: "none",
              },
              {
                name: "lastModified",
                type: "dateTime",
                multiValued: false,
                description: "The resource last modification time",
                required: false,
                mutability: "readOnly",
                returned: "default",
                uniqueness: "none",
              },
            ],
            mutability: "readOnly",
            returned: "default",
            uniqueness: "none",
          },
        ],
        meta: {
          resourceType: "Schema",
          location:
            "/api/public/scim/Schemas/urn:ietf:params:scim:schemas:core:2.0:User",
        },
      },
    ],
  });
}
