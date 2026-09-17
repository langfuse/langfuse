import type { NextApiRequest, NextApiResponse } from "next";

import { prisma } from "@langfuse/shared/src/db";

import { GatewayApiKeyAuthenticator } from "../../auth/gatewayApiKeyAuthenticator";
import { GatewayControlPlaneError } from "../../gatewayControlPlaneError";
import { type GatewayApiFormat, GatewayModelsResponseSchema } from "..";
import { GatewayModelsService } from "./gatewayModelsService";

export async function gatewayModelsApiHandler({
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
    const result = await new GatewayModelsService(prisma).list({
      context,
      apiFormat,
    });
    return res.status(200).json(GatewayModelsResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof GatewayControlPlaneError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
}
