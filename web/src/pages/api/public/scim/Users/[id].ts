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

  if (!["GET", "PUT", "PATCH", "DELETE"].includes(req.method || "")) {
    logger.error(
      `Method not allowed for ${req.method} on /api/public/scim/Users/[id]`,
    );
    return res.status(405).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail: "Method not allowed",
      status: 405
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
      status: 401
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
      detail: "Invalid API key. Organization-scoped API key required for this operation.",
      status: 403
    });
  }

  const userId = req.query.id as string;

  // GET - Retrieve a specific user
  if (req.method === "GET") {
    try {
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          orgId: authCheck.scope.orgId,
          deletedAt: null,
        },
      });

      if (!user) {
        return res.status(404).json({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "User not found",
          status: 404
        });
      }

      // Transform to SCIM format
      return res.status(200).json({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        id: user.id,
        userName: user.email,
        name: {
          givenName: user.name?.split(' ')[0] || '',
          familyName: user.name?.split(' ').slice(1).join(' ') || '',
        },
        active: user.active !== false, // Default to true if not explicitly false
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
      logger.error(`Error retrieving SCIM user ${userId}`, error);
      if (isPrismaException(error)) {
        return res.status(500).json({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "Internal Server Error",
          status: 500
        });
      }
      return res.status(500).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Internal server error",
        status: 500
      });
    }
  }

  // PUT - Replace a user (full update)
  if (req.method === "PUT") {
    try {
      const { userName, name, emails, active } = req.body;

      // Check if user exists
      const existingUser = await prisma.user.findFirst({
        where: {
          id: userId,
          orgId: authCheck.scope.orgId,
        },
      });

      if (!existingUser) {
        return res.status(404).json({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "User not found",
          status: 404
        });
      }

      // Construct full name from given and family names
      const fullName = name ? 
        `${name.givenName || ''} ${name.familyName || ''}`.trim() : 
        existingUser.name || '';

      // Get primary email or use userName as email
      const email = emails && emails.length > 0 ? 
        emails.find((e: any) => e.primary)?.value || emails[0].value : 
        userName || existingUser.email;

      // Update the user
      const updatedUser = await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          email: email,
          name: fullName,
          active: active !== undefined ? active === true : existingUser.active,
        },
      });

      // Return SCIM formatted user
      return res.status(200).json({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        id: updatedUser.id,
        userName: updatedUser.email,
        name: {
          givenName: updatedUser.name?.split(' ')[0] || '',
          familyName: updatedUser.name?.split(' ').slice(1).join(' ') || '',
        },
        active: updatedUser.active !== false,
        emails: [
          {
            primary: true,
            value: updatedUser.email,
            type: "work",
          },
        ],
        meta: {
          resourceType: "User",
          created: updatedUser.createdAt?.toISOString(),
          lastModified: updatedUser.updatedAt?.toISOString(),
        },
      });
    } catch (error) {
      logger.error(`Error updating SCIM user ${userId}`, error);
      return res.status(500).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Internal server error",
        status: 500
      });
    }
  }

  // PATCH - Partial update of a user
  if (req.method === "PATCH") {
    try {
      const { Operations } = req.body;

      // Check if user exists
      const existingUser = await prisma.user.findFirst({
        where: {
          id: userId,
          orgId: authCheck.scope.orgId,
        },
      });

      if (!existingUser) {
        return res.status(404).json({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "User not found",
          status: 404
        });
      }

      // Initialize update data
      const updateData: Record<string, any> = {};

      // Process operations
      if (Operations && Array.isArray(Operations)) {
        for (const op of Operations) {
          if (op.op === "replace") {
            if (op.path === "active" && op.value !== undefined) {
              updateData.active = op.value === true;
            } else if (op.path === "userName" && op.value) {
              updateData.email = op.value;
            } else if (op.path === "name.givenName" || op.path === "name.familyName") {
              // Handle name updates
              const nameParts = existingUser.name?.split(' ') || ['', ''];
              const givenName = op.path === "name.givenName" ? op.value : nameParts[0] || '';
              const familyName = op.path === "name.familyName" ? op.value : nameParts.slice(1).join(' ') || '';
              updateData.name = `${givenName} ${familyName}`.trim();
            } else if (!op.path && typeof op.value === 'object') {
              // Handle replace with entire value object
              if (op.value.active !== undefined) {
                updateData.active = op.value.active === true;
              }
              if (op.value.userName) {
                updateData.email = op.value.userName;
              }
              if (op.value.name) {
                updateData.name = `${op.value.name.givenName || ''} ${op.value.name.familyName || ''}`.trim();
              }
            }
          }
        }
      }

      // Update the user if there are changes
      if (Object.keys(updateData).length > 0) {
        const updatedUser = await prisma.user.update({
          where: {
            id: userId,
          },
          data: updateData,
        });

        // Return SCIM formatted user
        return res.status(200).json({
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          id: updatedUser.id,
          userName: updatedUser.email,
          name: {
            givenName: updatedUser.name?.split(' ')[0] || '',
            familyName: updatedUser.name?.split(' ').slice(1).join(' ') || '',
          },
          active: updatedUser.active !== false,
          emails: [
            {
              primary: true,
              value: updatedUser.email,
              type: "work",
            },
          ],
          meta: {
            resourceType: "User",
            created: updatedUser.createdAt?.toISOString(),
            lastModified: updatedUser.updatedAt?.toISOString(),
          },
        });
      } else {
        // No changes to make
        return res.status(200).json({
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          id: existingUser.id,
          userName: existingUser.email,
          name: {
            givenName: existingUser.name?.split(' ')[0] || '',
            familyName: existingUser.name?.split(' ').slice(1).join(' ') || '',
          },
          active: existingUser.active !== false,
          emails: [
            {
              primary: true,
              value: existingUser.email,
              type: "work",
            },
          ],
          meta: {
            resourceType: "User",
            created: existingUser.createdAt?.toISOString(),
            lastModified: existingUser.updatedAt?.toISOString(),
          },
        });
      }
    } catch (error) {
      logger.error(`Error patching SCIM user ${userId}`, error);
      return res.status(500).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Internal server error",
        status: 500
      });
    }
  }

  // DELETE - Delete a user
  if (req.method === "DELETE") {
    try {
      // Check if user exists
      const existingUser = await prisma.user.findFirst({
        where: {
          id: userId,
          orgId: authCheck.scope.orgId,
        },
      });

      if (!existingUser) {
        return res.status(404).json({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "User not found",
          status: 404
        });
      }

      // Soft delete the user
      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          deletedAt: new Date(),
          active: false,
        },
      });

      // Return empty response with 204 No Content
      return res.status(204).end();
    } catch (error) {
      logger.error(`Error deleting SCIM user ${userId}`, error);
      return res.status(500).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Internal server error",
        status: 500
      });
    }
  }
}
