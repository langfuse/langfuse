import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod/v4";

import { env } from "@/src/env.mjs";
import { prisma, type PrismaClient } from "@langfuse/shared/src/db";
import { createShaHash } from "@langfuse/shared/src/server/auth/apiKeys";

import { verifyGatewayHmacAuthorization } from "./auth";
import {
  GatewayApiFormatSchema,
  type GatewayApiFormat,
} from "./providerRegistry";
import { GatewayRepository } from "./repository";
import { GatewayResolveError } from "./resolveService";

const bodySchema = z.object({ api_format: GatewayApiFormatSchema }).strict();

export type GatewayResolveAuthContext = {
  organizationId: string;
  apiKeyId: string;
};

export type AuthenticatedGatewayResolveHandler = (params: {
  req: NextApiRequest;
  res: NextApiResponse;
  auth: GatewayResolveAuthContext;
  apiFormat: GatewayApiFormat;
}) => Promise<unknown>;

type GatewayResolveAuthConfig = {
  salt: string;
  serviceKeys: Array<{ id: string; secret: string }>;
};

type GatewayResolveAuthenticator = (params: {
  virtualSecretKey: string;
  apiFormat: GatewayApiFormat;
  gatewayAuthorization: string | undefined;
}) => Promise<GatewayResolveAuthContext>;

export async function authenticateGatewayResolveRequest(
  params: {
    virtualSecretKey: string;
    apiFormat: GatewayApiFormat;
    gatewayAuthorization: string | undefined;
  },
  database: PrismaClient,
  config: GatewayResolveAuthConfig,
): Promise<GatewayResolveAuthContext> {
  if (
    !verifyGatewayHmacAuthorization({
      header: params.gatewayAuthorization,
      apiFormat: params.apiFormat,
      keys: config.serviceKeys,
    })
  ) {
    throw new GatewayResolveError("Invalid gateway authorization", 401);
  }

  const association = await new GatewayRepository(
    database,
  ).resolveGatewayContext({
    fastHashedSecretKey: createShaHash(params.virtualSecretKey, config.salt),
  });
  const organizationId = association?.apiKey.orgId;
  if (!association || !organizationId) {
    throw new GatewayResolveError("Invalid gateway key", 401);
  }

  return {
    organizationId,
    apiKeyId: association.apiKeyId,
  };
}

export function withGatewayResolveAuth(
  handler: AuthenticatedGatewayResolveHandler,
  authenticate: GatewayResolveAuthenticator = authenticateConfiguredGatewayResolveRequest,
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    if (!bearer) {
      return res.status(401).json({ error: "Invalid gateway key" });
    }

    const body = bodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: "Invalid request" });
    }

    try {
      const auth = await authenticate({
        virtualSecretKey: bearer,
        apiFormat: body.data.api_format,
        gatewayAuthorization: singleHeader(
          req.headers["langfuse-gateway-authorization"],
        ),
      });

      return await handler({
        req,
        res,
        auth,
        apiFormat: body.data.api_format,
      });
    } catch (error) {
      if (error instanceof GatewayResolveError) {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}

async function authenticateConfiguredGatewayResolveRequest(params: {
  virtualSecretKey: string;
  apiFormat: GatewayApiFormat;
  gatewayAuthorization: string | undefined;
}) {
  if (!env.LANGFUSE_GATEWAY_SERVICE_KEY) {
    throw new GatewayResolveError("Gateway service is not configured", 503);
  }

  return authenticateGatewayResolveRequest(params, prisma, {
    salt: env.SALT,
    serviceKeys: [
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
    ],
  });
}

function singleHeader(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? undefined : value;
}
