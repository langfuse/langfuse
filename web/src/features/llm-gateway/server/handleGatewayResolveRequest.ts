import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";

import type { AuthenticatedGatewayResolveHandler } from "./auth";
import { GatewayResolveResponseSchema } from "./provider";
import { GatewayResolveError, GatewayResolveService } from "./resolveService";
import { createGatewayIngestionTokenSigner } from "./auth/auth";

const gatewayIngestionTokenSigner =
  env.LANGFUSE_GATEWAY_JWT_PRIVATE_KEY && env.LANGFUSE_GATEWAY_JWT_PUBLIC_KEY
    ? createGatewayIngestionTokenSigner({
        privateKey: env.LANGFUSE_GATEWAY_JWT_PRIVATE_KEY,
        keyId: env.LANGFUSE_GATEWAY_JWT_KEY_ID,
        issuer: env.LANGFUSE_GATEWAY_JWT_ISSUER,
        audience: env.LANGFUSE_GATEWAY_JWT_AUDIENCE,
      })
    : undefined;

export const handleGatewayResolveRequest: AuthenticatedGatewayResolveHandler =
  async ({ res, auth, apiFormat }) => {
    try {
      const result = await new GatewayResolveService(prisma, {
        jwtSigner: gatewayIngestionTokenSigner,
      }).resolve({
        organizationId: auth.organizationId,
        apiKeyId: auth.apiKeyId,
        apiFormat,
      });
      return res.status(200).json(GatewayResolveResponseSchema.parse(result));
    } catch (error) {
      if (error instanceof GatewayResolveError) {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  };
