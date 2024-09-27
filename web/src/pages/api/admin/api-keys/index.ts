import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";

/* 
This API route is used by Langfuse Cloud to delete API keys for a project. It will return 403 for self-hosters.
We will work on admin APIs in the future. See the discussion here: https://github.com/orgs/langfuse/discussions/3243
*/

const DeleteApiKeySchema = z.object({
  projectIds: z.array(z.string()),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // allow only POST requests
    if (req.method !== "DELETE") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      res.status(403).json({ error: "Only accessible on Langfuse cloud" });
      return;
    }

    // check if ADMIN_API_KEY is set
    if (!env.ADMIN_API_KEY) {
      logger.error("ADMIN_API_KEY is not set");
      res.status(500).json({ error: "ADMIN_API_KEY is not set" });
      return;
    }

    // check bearer token
    const { authorization } = req.headers;
    if (!authorization) {
      res
        .status(401)
        .json({ error: "Unauthorized: No authorization header provided" });
      return;
    }
    const [scheme, token] = authorization.split(" ");
    if (scheme !== "Bearer" || !token || token !== env.ADMIN_API_KEY) {
      res.status(401).json({ error: "Unauthorized: Invalid token" });
      return;
    }

    const body = DeleteApiKeySchema.safeParse(req.body);

    if (!body.success) {
      res.status(400).json({ error: body.error });
      return;
    }

    logger.info(
      `trying to remove API keys for projects ${body.data.projectIds.join(", ")}`,
    );

    // delete the API keys in the database first
    const apiKeysToBeDeleted = await prisma.apiKey.findMany({
      where: {
        projectId: {
          in: body.data.projectIds,
        },
      },
    });

    await prisma.apiKey.deleteMany({
      where: {
        projectId: {
          in: body.data.projectIds,
        },
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

    res.status(200).json({ message: "API keys deleted" });
  } catch (e) {
    logger.error("failed to remove API keys", e);
    res.status(500).json({ error: e });
  }
}
