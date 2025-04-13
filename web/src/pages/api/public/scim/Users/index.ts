import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { isPrismaException } from "@/src/utils/exceptions";
import { logger, redis } from "@langfuse/shared/src/server";

import { type NextApiRequest, type NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (req.method !== "GET" && req.method !== "POST") {
    logger.error(
      `Method not allowed for ${req.method} on /api/public/scim/Users`,
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

  if (req.method === "GET") {
    try {
      const { filter, startIndex = 1, count = 100 } = req.query;

      // Parse startIndex and count to integers
      const parsedStartIndex = parseInt(startIndex as string, 10) || 1;
      const parsedCount = parseInt(count as string, 10) || 100;

      // Handle filtering by userName if provided
      let whereClause: Record<string, unknown> = {
        orgId: authCheck.scope.orgId,
        deletedAt: null,
      };

      if (filter && typeof filter === "string") {
        // Parse filter for userName eq "value"
        const match = filter.match(/userName eq "([^"]+)"/i);
        if (match && match[1]) {
          whereClause = {
            ...whereClause,
            email: match[1],
          };
        }
      }

      // Get total count for pagination
      const totalCount = await prisma.user.count({
        where: whereClause,
      });

      // Get users with pagination
      const users = await prisma.user.findMany({
        where: whereClause,
        skip: parsedStartIndex - 1, // SCIM uses 1-based indexing
        take: parsedCount,
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      // Transform to SCIM format
      const scimUsers = users.map((user) => ({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        id: user.id,
        userName: user.email,
        name: {
          givenName: user.name?.split(" ")[0] || "",
          familyName: user.name?.split(" ").slice(1).join(" ") || "",
        },
        active: true, // Users are always active and will be deleted if inactivated.
        emails: [
          {
            primary: true,
            value: user.email,
            type: "work",
          },
        ],
        meta: {
          resourceType: "User",
        },
      }));

      return res.status(200).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        totalResults: totalCount,
        startIndex: parsedStartIndex,
        itemsPerPage: scimUsers.length,
        Resources: scimUsers,
      });
    } catch (error) {
      logger.error("Error retrieving SCIM users", error);
      return res.status(500).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Internal server error",
        status: 500,
      });
    }
  }

  if (req.method === "POST") {
    try {
      const { userName, name, emails, active = true } = req.body;

      if (!userName) {
        return res.status(400).json({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "userName is required",
          status: 400,
        });
      }

      // Check if user already exists
      const existingUser = await prisma.organizationMembership.findMany({
        where: {
          user: {
            email: userName,
          },
          orgId: authCheck.scope.orgId,
        },
      });

      if (existingUser) {
        return res.status(409).json({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "User with this userName already exists",
          status: 409,
        });
      }

      // Construct full name from given and family names
      const fullName = name
        ? `${name.givenName || ""} ${name.familyName || ""}`.trim()
        : "";

      // Get primary email or use userName as email
      const email =
        emails && emails.length > 0
          ? emails.find((e: any) => e.primary)?.value || emails[0].value
          : userName;

      // Create the user
      const user = await prisma.user.create({
        data: {
          email: email,
          name: fullName,
        },
      });
      await prisma.organizationMembership.create({
        data: {
          userId: user.id,
          orgId: authCheck.scope.orgId,
          role: "NONE",
        },
      });

      // Return SCIM formatted user
      return res.status(201).json({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        id: user.id,
        userName: user.email,
        name: {
          givenName: user.name?.split(" ")[0] || "",
          familyName: user.name?.split(" ").slice(1).join(" ") || "",
        },
        active: true,
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
    } catch (error) {
      logger.error("Failed to create SCIM user", error);
      return res.status(500).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Internal server error",
        status: 500,
      });
    }
  }
}
