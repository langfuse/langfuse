import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod/v4";

import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";

import {
  GatewayApiFormatSchema,
  GatewayResolveResponseSchema,
} from "./providerRegistry";
import { GatewayResolveError, GatewayResolveService } from "./resolveService";

const bodySchema = z.object({ api_format: GatewayApiFormatSchema }).strict();

export async function handleGatewayResolveRequest(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  const body = bodySchema.safeParse(req.body);
  if (!bearer) {
    return res.status(401).json({ error: "Invalid gateway key" });
  }
  if (!body.success) {
    return res.status(400).json({ error: "Invalid request" });
  }
  if (!env.LANGFUSE_GATEWAY_SERVICE_KEY) {
    return res.status(503).json({ error: "Gateway service is not configured" });
  }

  const serviceKeys = [
    {
      id: env.LANGFUSE_GATEWAY_SERVICE_KEY_ID,
      secret: env.LANGFUSE_GATEWAY_SERVICE_KEY,
    },
    ...(env.LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS_ID &&
    env.LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS
      ? [
          {
            id: env.LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS_ID,
            secret: env.LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS,
          },
        ]
      : []),
  ];

  try {
    const result = await new GatewayResolveService(prisma, {
      salt: env.SALT,
      serviceKeys,
      jwt:
        env.LANGFUSE_GATEWAY_JWT_PRIVATE_KEY &&
        env.LANGFUSE_GATEWAY_JWT_PUBLIC_KEY
          ? {
              privateKey: env.LANGFUSE_GATEWAY_JWT_PRIVATE_KEY,
              keyId: env.LANGFUSE_GATEWAY_JWT_KEY_ID,
              issuer: env.LANGFUSE_GATEWAY_JWT_ISSUER,
              audience: env.LANGFUSE_GATEWAY_JWT_AUDIENCE,
            }
          : undefined,
    }).resolve({
      virtualSecretKey: bearer,
      apiFormat: body.data.api_format,
      gatewayAuthorization: singleHeader(
        req.headers["langfuse-gateway-authorization"],
      ),
    });
    return res.status(200).json(GatewayResolveResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof GatewayResolveError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
}

function singleHeader(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? undefined : value;
}
