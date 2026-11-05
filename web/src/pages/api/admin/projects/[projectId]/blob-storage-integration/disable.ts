import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { logger } from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";
import { disableBlobStorageIntegrationByAdmin } from "@/src/features/blobstorage-integration/adminDisable";

const BodySchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

const QuerySchema = z.object({
  projectId: z.string().min(1),
});

/*
Used by Langfuse administrators to turn off a project's blob storage export.
The reason is shown on the project's integration settings page and sent to its
notification channels and admin emails.
*/
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    if (
      !AdminApiAuthService.handleAdminAuth(req, res, {
        isAllowedOnLangfuseCloud: true,
      })
    ) {
      return;
    }

    const query = QuerySchema.safeParse(req.query);
    const body = BodySchema.safeParse(req.body);
    if (!query.success || !body.success) {
      res.status(400).json({
        error: "Invalid request",
        details: [query.error?.issues, body.error?.issues]
          .flat()
          .filter(Boolean),
      });
      return;
    }

    const { projectId } = query.data;
    const result = await disableBlobStorageIntegrationByAdmin({
      projectId,
      reason: body.data.reason,
    });

    switch (result.kind) {
      case "not-found":
        res
          .status(404)
          .json({ error: "Blob storage integration not found for project" });
        return;
      case "already-disabled":
        res
          .status(409)
          .json({ error: "Blob storage integration is already disabled" });
        return;
      case "disabled":
        res.status(200).json({
          projectId,
          enabled: false,
          lastError: result.lastError,
          lastErrorAt: result.lastErrorAt,
          notificationSent: result.notificationSent,
        });
        return;
      default: {
        const _exhaustiveCheck: never = result;
        throw new Error(
          `Unhandled admin disable result: ${JSON.stringify(_exhaustiveCheck)}`,
        );
      }
    }
  } catch (e) {
    logger.error("Failed to disable blob storage integration", e);
    res.status(500).json({ error: "Internal server error" });
  }
}
