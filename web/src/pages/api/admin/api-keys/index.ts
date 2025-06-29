import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod/v4";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";

/* 
This API route is used by Langfuse Cloud to delete API keys for a project. It will return 403 for self-hosters.
We will work on admin APIs in the future. See the discussion here: https://github.com/orgs/langfuse/discussions/3243
*/

const DeleteApiKeySchema = z.object({
  action: z.literal("delete"),
  projectIds: z.array(z.string()),
});

const InvalidateApiKeySchema = z.object({
  action: z.literal("invalidate"),
  projectIds: z.array(z.string()),
});

const ApiKeyAction = z.discriminatedUnion("action", [
  DeleteApiKeySchema,
  InvalidateApiKeySchema,
]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // allow only POST requests
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    if (!AdminApiAuthService.handleAdminAuth(req, res)) {
      return;
    }

    const body = ApiKeyAction.safeParse(req.body);

    if (!body.success) {
      res.status(400).json({ error: body.error });
      return;
    }

    if (body.data.action === "delete") {
      logger.info(
        `trying to remove API keys for projects ${body.data.projectIds.join(", ")}`,
      );

      // delete the API keys in the database first
      const apiKeysToBeDeleted = await prisma.apiKey.findMany({
        where: {
          projectId: {
            in: body.data.projectIds,
          },
          scope: "PROJECT",
        },
      });

      await prisma.apiKey.deleteMany({
        where: {
          projectId: {
            in: body.data.projectIds,
          },
          scope: "PROJECT",
        },
      });

      // then delete from the cache
      await new ApiAuthService(prisma, redis).invalidate(
        apiKeysToBeDeleted,
        `projects ${body.data.projectIds.join(", ")}`,
      );

      logger.info(
        `Removed API keys for projects ${body.data.projectIds.join(", ")}`,
      );

      return res.status(200).json({ message: "API keys deleted" });
    } else if (body.data.action === "invalidate") {
      // delete the API keys in the database first
      const apiKeysToBeInvalidated = await prisma.apiKey.findMany({
        where: {
          projectId: {
            in: body.data.projectIds,
          },
          scope: "PROJECT",
        },
      });

      // then delete from the cache
      await new ApiAuthService(prisma, redis).invalidate(
        apiKeysToBeInvalidated,
        `projects ${body.data.projectIds.join(", ")}`,
      );

      logger.info(
        `Invalidated API keys for projects ${body.data.projectIds.join(", ")}`,
      );
      return res.status(200).json({ message: "API keys invalidated" });
    }

    // return not implemented error
    res.status(404).json({ error: "Action does not exist" });
  } catch (e) {
    logger.error("failed to remove API keys", e);
    res.status(500).json({ error: e });
  }
}
