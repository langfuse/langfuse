import crypto from "node:crypto";
import { type NextApiRequest, type NextApiResponse } from "next";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { prisma } from "@langfuse/shared/src/db";
import { redis, logger } from "@langfuse/shared/src/server";
import { isPrismaException } from "@/src/utils/exceptions";
import { env } from "@/src/env.mjs";

/**
 * Internal service-to-service endpoint: verify a public-API Authorization
 * header and return the resolved auth scope.
 *
 * Used by the Go observations-api sidecar on API-key cache misses. The full
 * ApiAuthService flow runs here (bcrypt legacy keys, fastHashedSecretKey
 * upgrade writes, plan resolution from cloudConfig) and warms the shared
 * Redis api-key cache as a side effect, so subsequent requests resolve on
 * the sidecar's Redis fast path.
 *
 * Guarded by the LANGFUSE_INTERNAL_API_SECRET shared secret; the endpoint
 * does not exist (404) when the secret is not configured.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const secret = env.LANGFUSE_INTERNAL_API_SECRET;
  if (!secret) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ message: "Method Not Allowed" });
    return;
  }

  const provided = req.headers["x-langfuse-internal-secret"];
  if (
    typeof provided !== "string" ||
    provided.length !== secret.length ||
    !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
  ) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const allowInAppAgentKey = req.query.allowInAppAgentKey === "true";

  try {
    const result = await new ApiAuthService(
      prisma,
      redis,
    ).verifyAuthHeaderAndReturnScope(req.headers.authorization, {
      allowInAppAgentKey,
    });
    res.status(200).json(result);
  } catch (error) {
    logger.error("Internal API key verification failed", error);
    if (isPrismaException(error)) {
      res.status(503).json({ message: "Service Unavailable" });
      return;
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
}
