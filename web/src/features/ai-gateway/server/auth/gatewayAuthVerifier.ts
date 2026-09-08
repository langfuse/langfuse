import { createHash } from "node:crypto";

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod/v4";

import { env } from "@/src/env.mjs";
import { verifyHmacSha256 } from "@/src/server/utils/hmac";
import { createShaHash } from "@langfuse/shared/src/server/auth/apiKeys";

import { GatewayApiFormatSchema, type GatewayApiFormat } from "../provider";
import { GatewayControlPlaneError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";

const RESOLVE_METHOD = "POST";
const MODELS_METHOD = "GET";
const SIGNATURE_DOMAIN = "gateway-web-v1";
const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;
const resolveBodySchema = z
  .object({ api_format: GatewayApiFormatSchema })
  .strict();
const modelsQuerySchema = z
  .object({ api_format: GatewayApiFormatSchema })
  .strict();
const gatewayAuthorizationSchema =
  /^HMAC timestamp=(\d+),signature=([0-9a-f]{64})$/;

type GatewayControlPlaneHandlerParams = {
  req: NextApiRequest;
  res: NextApiResponse;
  fastHashedSecretKey: string;
};

type GatewayResolveHandler = (
  params: GatewayControlPlaneHandlerParams & {
    apiFormat: GatewayApiFormat;
  },
) => Promise<unknown>;

type GatewayModelsHandler = (
  params: GatewayControlPlaneHandlerParams & {
    apiFormat: GatewayApiFormat;
  },
) => Promise<unknown>;

function verifyGatewayControlPlaneRequest(input: {
  virtualSecretKey: string;
  gatewayAuthorization: string | undefined;
}): string {
  if (!env.LANGFUSE_GATEWAY_SERVICE_KEY) {
    throw new GatewayControlPlaneError(
      "Gateway service is not configured",
      503,
    );
  }
  const serviceKeys = [
    env.LANGFUSE_GATEWAY_SERVICE_KEY,
    ...(env.LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS
      ? [env.LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS]
      : []),
  ];

  if (
    !verifyGatewayAuthorization(
      {
        credential: input.virtualSecretKey,
        gatewayAuthorization: input.gatewayAuthorization,
      },
      serviceKeys,
    )
  ) {
    throw new GatewayControlPlaneError("Invalid gateway authorization", 401);
  }

  return createShaHash(input.virtualSecretKey, env.SALT);
}

export function withGatewayResolveAuth(handler: GatewayResolveHandler) {
  return withGatewayControlPlaneAuth(
    ({ body, ...params }) => handler({ ...params, apiFormat: body.api_format }),
    resolveBodySchema,
  );
}

export function withGatewayModelsAuth(handler: GatewayModelsHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    setNoStoreHeaders(res);

    if (req.method !== MODELS_METHOD) {
      res.setHeader("Allow", MODELS_METHOD);
      return res.status(405).json({ error: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Invalid gateway key" });
    }

    const query = modelsQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({ error: "Invalid request" });
    }

    try {
      const fastHashedSecretKey = verifyGatewayControlPlaneRequest({
        virtualSecretKey: token,
        gatewayAuthorization: singleHeader(
          req.headers["langfuse-gateway-authorization"],
        ),
      });

      return await handler({
        req,
        res,
        fastHashedSecretKey,
        apiFormat: query.data.api_format,
      });
    } catch (error) {
      if (error instanceof GatewayControlPlaneError) {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}

function withGatewayControlPlaneAuth<
  Body extends { api_format: GatewayApiFormat },
>(
  handler: (
    params: GatewayControlPlaneHandlerParams & { body: Body },
  ) => Promise<unknown>,
  schema: z.ZodType<Body>,
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    setNoStoreHeaders(res);

    if (req.method !== RESOLVE_METHOD) {
      res.setHeader("Allow", RESOLVE_METHOD);
      return res.status(405).json({ error: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Invalid gateway key" });
    }

    let requestBody: string;
    try {
      requestBody = await readRequestBody(req);
    } catch {
      return res.status(400).json({ error: "Invalid request" });
    }

    const body = schema.safeParse(parseJson(requestBody));
    if (!body.success) {
      return res.status(400).json({ error: "Invalid request" });
    }

    try {
      const fastHashedSecretKey = verifyGatewayControlPlaneRequest({
        virtualSecretKey: token,
        gatewayAuthorization: singleHeader(
          req.headers["langfuse-gateway-authorization"],
        ),
      });

      return await handler({
        req,
        res,
        fastHashedSecretKey,
        body: body.data,
      });
    } catch (error) {
      if (error instanceof GatewayControlPlaneError) {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}

function setNoStoreHeaders(res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

function getBearerToken(req: NextApiRequest): string | undefined {
  const [scheme, token, ...additionalParts] = (req.headers.authorization ?? "")
    .trim()
    .split(/\s+/);
  return scheme === "Bearer" && token && additionalParts.length === 0
    ? token
    : undefined;
}

export function verifyGatewayAuthorization(
  input: {
    credential: string;
    gatewayAuthorization: string | undefined;
  },
  serviceKeys: string[],
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
      SIGNATURE_DOMAIN,
      timestamp.toString(),
      sha256(input.credential),
    ].join("\n"),
    signature,
    secrets: serviceKeys,
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
    if (size > 1024) throw new Error("Gateway request body is too large");
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
