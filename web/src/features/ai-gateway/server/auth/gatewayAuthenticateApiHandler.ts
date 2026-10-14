import { prisma } from "@langfuse/shared/src/db";
import type { NextApiRequest, NextApiResponse } from "next";

import { GatewayApiKeyAuthenticator } from "@/src/features/ai-gateway/server/auth/gatewayApiKeyAuthenticator";
import { GatewayControlPlaneError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";
import type { GatewayApiFormat } from "@/src/features/ai-gateway/server/provider";

export async function gatewayAuthenticateApiHandler({
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
    await new GatewayApiKeyAuthenticator(prisma).authenticateModelsRequest({
      fastHashedSecretKey,
      apiFormat,
    });
    return res.status(200).json({});
  } catch (error) {
    if (error instanceof GatewayControlPlaneError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
}
