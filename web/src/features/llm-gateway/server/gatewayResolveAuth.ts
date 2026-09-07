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

type GatewayResolveAuthContext = {
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
  serviceKeys: Array<{ secret: string }>;
};

type GatewayResolveAuthenticator = (params: {
  virtualSecretKey: string;
  requestBody: string;
  gatewayAuthorization: string | undefined;
}) => Promise<GatewayResolveAuthContext>;

async function authenticateGatewayResolveRequest(
  params: {
    virtualSecretKey: string;
    requestBody: string;
    gatewayAuthorization: string | undefined;
  },
  database: PrismaClient,
  config: GatewayResolveAuthConfig,
): Promise<GatewayResolveAuthContext> {
  if (
    !verifyGatewayHmacAuthorization({
      header: params.gatewayAuthorization,
      virtualSecretKey: params.virtualSecretKey,
      requestBody: params.requestBody,
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

    const [scheme, token, ...additionalParts] = (
      req.headers.authorization ?? ""
    )
      .trim()
      .split(/\s+/);
    if (scheme !== "Bearer" || !token || additionalParts.length > 0) {
      return res.status(401).json({ error: "Invalid gateway key" });
    }

    let requestBody: string;
    try {
      requestBody = await readRequestBody(req);
    } catch {
      return res.status(400).json({ error: "Invalid request" });
    }

    const body = bodySchema.safeParse(parseJson(requestBody));
    if (!body.success) {
      return res.status(400).json({ error: "Invalid request" });
    }

    try {
      const auth = await authenticate({
        virtualSecretKey: token,
        requestBody,
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
  requestBody: string;
  gatewayAuthorization: string | undefined;
}) {
  if (!env.LANGFUSE_GATEWAY_SERVICE_KEY) {
    throw new GatewayResolveError("Gateway service is not configured", 503);
  }

  return authenticateGatewayResolveRequest(params, prisma, {
    salt: env.SALT,
    serviceKeys: [
      {
        secret: env.LANGFUSE_GATEWAY_SERVICE_KEY,
      },
      ...(env.LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS
        ? [
            {
              secret: env.LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS,
            },
          ]
        : []),
    ],
  });
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

async function readRequestBody(req: NextApiRequest): Promise<string> {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.body !== undefined) return JSON.stringify(req.body);

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024) throw new Error("Gateway resolve body is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function singleHeader(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? undefined : value;
}
