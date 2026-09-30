import { prisma } from "@langfuse/shared/src/db";
import { logger, traceException } from "@langfuse/shared/src/server";
import type { NextApiRequest, NextApiResponse } from "next";

import { GatewayApiKeyAuthenticator } from "@/src/features/ai-gateway/server/auth/gatewayApiKeyAuthenticator";
import {
  type GatewayApiFormat,
  GatewayResolveResponseSchema,
} from "@/src/features/ai-gateway/server/provider";
import { GatewayResolveError, GatewayResolveService } from "./resolveService";

export async function gatewayResolveApiHandler({
  res,
  fastHashedSecretKey,
  apiFormat,
}: {
  req: NextApiRequest;
  res: NextApiResponse;
  fastHashedSecretKey: string;
  apiFormat: GatewayApiFormat;
}) {
  try {
    const context = await new GatewayApiKeyAuthenticator(
      prisma,
    ).authenticateRequest({ fastHashedSecretKey, apiFormat });
    const result = await new GatewayResolveService().resolve({
      context,
      apiFormat,
    });
    return res.status(200).json(GatewayResolveResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof GatewayResolveError) {
      // The data plane retries a 503, so tell it when to come back rather than
      // letting it hammer a database that is already struggling.
      if (error.status === 503) res.setHeader("Retry-After", "1");
      return res.status(error.status).json({ error: error.message });
    }
    logger.error("Unexpected error resolving gateway request", error);
    traceException(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
