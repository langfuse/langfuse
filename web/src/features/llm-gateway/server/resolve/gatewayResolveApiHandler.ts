import { env } from "@/src/env.mjs";
import { createEd25519JwtSigner } from "@/src/server/utils/jwt";
import { prisma } from "@langfuse/shared/src/db";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  type GatewayApiFormat,
  GatewayResolveResponseSchema,
} from "@/src/features/llm-gateway/server/provider";
import { GatewayResolveError, GatewayResolveService } from "./resolveService";

const gatewayIngestionTokenSigner =
  env.LANGFUSE_GATEWAY_JWT_PRIVATE_KEY && env.LANGFUSE_GATEWAY_JWT_PUBLIC_KEY
    ? createEd25519JwtSigner({
        privateKey: env.LANGFUSE_GATEWAY_JWT_PRIVATE_KEY,
        keyId: env.LANGFUSE_GATEWAY_JWT_KEY_ID,
        issuer: env.LANGFUSE_GATEWAY_JWT_ISSUER,
        audience: env.LANGFUSE_GATEWAY_JWT_AUDIENCE,
      })
    : undefined;

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
    const result = await new GatewayResolveService(prisma, {
      jwtSigner: gatewayIngestionTokenSigner,
    }).resolve({
      fastHashedSecretKey,
      apiFormat,
    });
    return res.status(200).json(GatewayResolveResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof GatewayResolveError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
}
