import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/features/admin-api/server/adminApiAuth";
import { organizationNameSchema } from "@/src/features/organizations/utils/organizationNameSchema";
import { auditLog } from "@/src/features/audit-logs/auditLog";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // Allow only POST requests
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    // Verify admin API authentication, but allow non-langfuse cloud use-cases
    if (!AdminApiAuthService.handleAdminAuth(req, res, false)) {
      return;
    }

    // For POST requests, create a new organization
    if (req.method === "POST") {
      // Validate the request body using the organizationNameSchema
      const validationResult = organizationNameSchema.safeParse(req.body);

      if (!validationResult.success) {
        res.status(400).json({
          error: "Invalid request body",
          details: validationResult.error.format(),
        });
        return;
      }

      const { name } = validationResult.data;

      // Create the organization in the database
      const organization = await prisma.organization.create({
        data: {
          name,
        },
      });

      // Log the organization creation
      await auditLog({
        resourceType: "organization",
        resourceId: organization.id,
        action: "create",
        orgId: organization.id,
        orgRole: "ADMIN",
        after: organization,
        apiKeyId: "ADMIN_KEY",
      });

      logger.info(`Created organization ${organization.id} via admin API`);

      return res.status(201).json({
        id: organization.id,
        name: organization.name,
        createdAt: organization.createdAt,
      });
    }
  } catch (e) {
    logger.error("Failed to process organization request", e);
    res.status(500).json({ error: "Internal server error" });
  }
}
