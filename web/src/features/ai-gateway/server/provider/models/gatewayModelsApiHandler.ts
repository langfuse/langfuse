import type { NextApiRequest, NextApiResponse } from "next";

import { prisma } from "@langfuse/shared/src/db";

import { GatewayControlPlaneError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";
import {
  type GatewayApiFormat,
  GatewayModelsResponseSchema,
} from "@/src/features/ai-gateway/server/provider";
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
    const result = await new GatewayModelsService(prisma).list({
      fastHashedSecretKey,
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
