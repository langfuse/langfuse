import { type NextApiRequest, type NextApiResponse } from "next";
import { env } from "@/src/env.mjs";
import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";

const DeleteApiKeySchema = z.object({
  projectId: z.string(),
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
    // check if ADMIN_API_KEY is set
    if (!env.ADMIN_API_KEY) {
      res.status(500).json({ error: "ADMIN_API_KEY is not set" });
      return;
    }
    if (!env.ENCRYPTION_KEY) {
      res.status(500).json({ error: "ENCRYPTION_KEY is not set" });
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

    // delete the API keys in the database first
    const apiKeysToBeDeleted = await prisma.apiKey.findMany({
      where: {
        projectId: body.data.projectId,
      },
    });

    await prisma.apiKey.deleteMany({
      where: {
        projectId: body.data.projectId,
      },
    });

    // then delete from the cache
    await new ApiAuthService(prisma, redis).invalidate(
      apiKeysToBeDeleted,
      `project ${body.data.projectId}`,
    );
  } catch (e) {
    res.status(500).json({ error: e });
  }
}
