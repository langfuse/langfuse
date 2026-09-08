import { createHash } from "node:crypto";

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod/v4";

import { env } from "@/src/env.mjs";
import { verifyHmacSha256 } from "@/src/server/utils/hmac";
import { createShaHash } from "@langfuse/shared/src/server/auth/apiKeys";

import { GatewayApiFormatSchema, type GatewayApiFormat } from "../provider";
import { GatewayControlPlaneError } from "@/src/features/llm-gateway/server/gatewayControlPlaneError";

const CONTROL_PLANE_METHOD = "POST";
const RESOLVE_PATH = "/api/internal/ai-gateway/v1/resolve";
const MODELS_PATH = "/api/internal/ai-gateway/v1/models";
const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;
const resolveBodySchema = z
  .object({ api_format: GatewayApiFormatSchema })
  .strict();
const modelsBodySchema = z
  .discriminatedUnion("api_format", [
    z
      .object({
        api_format: z.literal("anthropic.messages"),
        before_id: z.string().min(1).optional(),
        after_id: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      })
      .strict(),
    z
      .object({
        api_format: z.enum(["openai.responses", "openai.chat-completions"]),
      })
      .strict(),
  ])
  .refine((body) => {
    return !(
      body.api_format === "anthropic.messages" &&
      body.before_id &&
      body.after_id
    );
  });
const gatewayAuthorizationSchema =
  /^HMAC timestamp=(\d+),signature=([A-Za-z0-9_-]{43})$/;

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
  params: GatewayControlPlaneHandlerParams &
    (
      | {
          apiFormat: "anthropic.messages";
          beforeId?: string;
          afterId?: string;
          limit?: number;
        }
      | {
          apiFormat: "openai.responses" | "openai.chat-completions";
        }
    ),
) => Promise<unknown>;

function verifyGatewayControlPlaneRequest(input: {
  virtualSecretKey: string;
  requestBody: string;
  gatewayAuthorization: string | undefined;
  path: string;
}): string {
  if (!env.LANGFUSE_GATEWAY_SERVICE_KEY) {
    throw new GatewayControlPlaneError(
      "Gateway service is not configured",
      503,
    );
  }
  const serviceKeys = [
    { secret: env.LANGFUSE_GATEWAY_SERVICE_KEY },
    ...(env.LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS
      ? [{ secret: env.LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS }]
      : []),
  ];

  if (!verifyGatewayAuthorization(input, serviceKeys)) {
    throw new GatewayControlPlaneError("Invalid gateway authorization", 401);
  }

  return createShaHash(input.virtualSecretKey, env.SALT);
}

export function withGatewayResolveAuth(handler: GatewayResolveHandler) {
  return withGatewayControlPlaneAuth(
    ({ body, ...params }) => handler({ ...params, apiFormat: body.api_format }),
    RESOLVE_PATH,
    resolveBodySchema,
  );
}

export function withGatewayModelsAuth(handler: GatewayModelsHandler) {
  return withGatewayControlPlaneAuth(
    ({ body, ...params }) =>
      body.api_format === "anthropic.messages"
        ? handler({
            ...params,
            apiFormat: body.api_format,
            beforeId: body.before_id,
            afterId: body.after_id,
            limit: body.limit,
          })
        : handler({ ...params, apiFormat: body.api_format }),
    MODELS_PATH,
    modelsBodySchema,
  );
}

function withGatewayControlPlaneAuth<
  Body extends { api_format: GatewayApiFormat },
>(
  handler: (
    params: GatewayControlPlaneHandlerParams & { body: Body },
  ) => Promise<unknown>,
  path: string,
  schema: z.ZodType<Body>,
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");

    if (req.method !== CONTROL_PLANE_METHOD) {
      res.setHeader("Allow", CONTROL_PLANE_METHOD);
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

    const body = schema.safeParse(parseJson(requestBody));
    if (!body.success) {
      return res.status(400).json({ error: "Invalid request" });
    }

    try {
      const fastHashedSecretKey = verifyGatewayControlPlaneRequest({
        virtualSecretKey: token,
        requestBody,
        gatewayAuthorization: singleHeader(
          req.headers["langfuse-gateway-authorization"],
        ),
        path,
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

function verifyGatewayAuthorization(
  input: {
    virtualSecretKey: string;
    requestBody: string;
    gatewayAuthorization: string | undefined;
    path: string;
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
      input.path,
      CONTROL_PLANE_METHOD,
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
