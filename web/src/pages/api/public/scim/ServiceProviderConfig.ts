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
      `[SCIM] Method not allowed for ${req.method} on /api/public/scim/ServiceProviderConfig`,
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
    name: "SCIM ServiceProviderConfig",
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

  // Return the service provider configuration
  return res.status(200).json({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    documentationUri:
      "https://langfuse.com/docs/administration/scim-and-org-api",
    patch: {
      supported: false,
    },
    bulk: {
      supported: false,
      maxOperations: 0,
      maxPayloadSize: 0,
    },
    filter: {
      supported: true,
      maxResults: 100,
    },
    changePassword: {
      supported: false,
    },
    sort: {
      supported: false,
    },
    etag: {
      supported: false,
    },
    authenticationSchemes: [
      {
        name: "Basic Authentication",
        description: "Authentication via HTTP Basic Auth",
        specUri: "https://tools.ietf.org/html/rfc2617",
        type: "httpbasic",
        primary: true,
      },
    ],
    meta: {
      resourceType: "ServiceProviderConfig",
      location: "/api/public/scim/ServiceProviderConfig",
    },
  });
}
