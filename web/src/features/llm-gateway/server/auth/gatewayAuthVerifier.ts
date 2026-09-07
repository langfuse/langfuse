import { createHash } from "node:crypto";

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod/v4";

import { env } from "@/src/env.mjs";
import { verifyHmacSha256 } from "@/src/server/utils/hmac";
import { prisma } from "@langfuse/shared/src/db";
import { createShaHash } from "@langfuse/shared/src/server/auth/apiKeys";

import { GatewayApiKeyRepository } from "../apiKey/gatewayApiKeyRepository";
import { GatewayApiFormatSchema, type GatewayApiFormat } from "../provider";
import { GatewayResolveError } from "@/src/features/llm-gateway/server/resolve/resolveService";

const RESOLVE_METHOD = "POST";
const RESOLVE_PATH = "/api/internal/ai-gateway/v1/resolve";
const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;
const bodySchema = z.object({ api_format: GatewayApiFormatSchema }).strict();
const gatewayAuthorizationSchema =
  /^HMAC timestamp=(\d+),signature=([A-Za-z0-9_-]{43})$/;

type GatewayResolveAuthContext = {
  organizationId: string;
  apiKeyId: string;
};

type AuthenticatedGatewayResolveHandler = (params: {
  req: NextApiRequest;
  res: NextApiResponse;
  auth: GatewayResolveAuthContext;
  apiFormat: GatewayApiFormat;
}) => Promise<unknown>;

async function authenticateGatewayResolveRequest(input: {
  virtualSecretKey: string;
  requestBody: string;
  gatewayAuthorization: string | undefined;
}): Promise<GatewayResolveAuthContext> {
  if (!env.LANGFUSE_GATEWAY_SERVICE_KEY) {
    throw new GatewayResolveError("Gateway service is not configured", 503);
  }
  const serviceKeys = [
    { secret: env.LANGFUSE_GATEWAY_SERVICE_KEY },
    ...(env.LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS
      ? [{ secret: env.LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS }]
      : []),
  ];

  if (!verifyGatewayAuthorization(input, serviceKeys)) {
    throw new GatewayResolveError("Invalid gateway authorization", 401);
  }

  const association = await new GatewayApiKeyRepository(
    prisma,
  ).resolveGatewayContext({
    fastHashedSecretKey: createShaHash(input.virtualSecretKey, env.SALT),
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
      const auth = await authenticateGatewayResolveRequest({
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

function verifyGatewayAuthorization(
  input: {
    virtualSecretKey: string;
    requestBody: string;
    gatewayAuthorization: string | undefined;
  },
  serviceKeys: Array<{ secret: string }>,
): boolean {
  const match = gatewayAuthorizationSchema.exec(
    input.gatewayAuthorization ?? "",
  );
  if (!match) return false;

  const [, timestampValue, signature] = match;
  const timestamp = Number(timestampValue);
  const now = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(now - timestamp) > SIGNATURE_MAX_AGE_SECONDS
  ) {
    return false;
  }

  return verifyHmacSha256({
    message: [
      timestamp.toString(),
      sha256(input.virtualSecretKey),
      RESOLVE_PATH,
      RESOLVE_METHOD,
      sha256(input.requestBody),
    ].join("\n"),
    signature,
    secrets: serviceKeys.map(({ secret }) => secret),
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
  if (req.body !== undefined) throw new Error("Expected an unparsed body");

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

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
