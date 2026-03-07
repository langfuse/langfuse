import { type NextApiRequest, type NextApiResponse } from "next";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { prisma } from "@langfuse/shared/src/db";
import {
  redis,
  logger,
  traceException,
} from "@langfuse/shared/src/server";
import {
  UnauthorizedError,
  MethodNotAllowedError,
  BaseError,
} from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import { hashLLMRequest } from "@/src/features/llm-cache/server/hash";
import {
  getCachedResponse,
  setCachedResponse,
} from "@/src/features/llm-cache/server/cache-service";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4.5mb",
    },
  },
};

/**
 * Sketrace LLM Proxy — OpenAI-compatible endpoint with response caching.
 *
 * Developers point their OpenAI SDK base_url to:
 *   http://localhost:3000/api/public/sketrace/llm-proxy
 *
 * The proxy:
 * 1. Authenticates using Langfuse project API keys (Authorization: Bearer sk-lf-...)
 * 2. Hashes the request to check the cache
 * 3. On cache hit: returns cached response with X-Sketrace-Cache: HIT
 * 4. On cache miss: forwards to the real LLM API, caches response, returns with X-Sketrace-Cache: MISS
 *
 * Supports: POST /chat/completions (OpenAI-compatible)
 * The path suffix after llm-proxy is forwarded to the target API.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await runMiddleware(req, res, cors);

    if (req.method !== "POST") throw new MethodNotAllowedError();

    // Authenticate
    const authCheck = await new ApiAuthService(
      prisma,
      redis,
    ).verifyAuthHeaderAndReturnScope(req.headers.authorization);

    if (!authCheck.validKey) {
      throw new UnauthorizedError(authCheck.error);
    }
    if (!authCheck.scope.projectId) {
      throw new UnauthorizedError("Missing projectId in scope.");
    }

    const projectId = authCheck.scope.projectId;
    const body = req.body as Record<string, unknown>;

    // Check if caching is enabled
    const cachingEnabled = env.SKETRACE_LLM_CACHE_ENABLED === "true";

    if (cachingEnabled) {
      // Hash the request for cache lookup
      const contentHash = hashLLMRequest(body);

      // Check cache
      const cached = await getCachedResponse({ projectId, contentHash });
      if (cached) {
        res.setHeader("X-Sketrace-Cache", "HIT");
        res.setHeader("X-Sketrace-Cache-Hash", contentHash);
        return res.status(200).json(JSON.parse(cached));
      }

      // Cache miss — forward to real API
      const targetResponse = await forwardToLLMApi(body, req);

      // Cache the response
      const responseStr = JSON.stringify(targetResponse);
      await setCachedResponse({
        projectId,
        contentHash,
        response: responseStr,
      }).catch((err) => {
        logger.error("Failed to cache LLM response", err);
      });

      res.setHeader("X-Sketrace-Cache", "MISS");
      res.setHeader("X-Sketrace-Cache-Hash", contentHash);
      return res.status(200).json(targetResponse);
    }

    // Caching disabled — just forward
    const targetResponse = await forwardToLLMApi(body, req);
    res.setHeader("X-Sketrace-Cache", "DISABLED");
    return res.status(200).json(targetResponse);
  } catch (error: unknown) {
    if (!(error instanceof UnauthorizedError)) {
      logger.error("sketrace llm-proxy error", error);
      traceException(error);
    }

    if (error instanceof BaseError) {
      return res.status(error.httpCode).json({
        error: error.name,
        message: error.message,
      });
    }

    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    return res.status(500).json({
      error: "Internal Server Error",
      message: errorMessage,
    });
  }
}

/**
 * Forwards the request to the actual LLM API.
 * Reads the target URL from X-Sketrace-Target-Url header or defaults to OpenAI.
 */
async function forwardToLLMApi(
  body: Record<string, unknown>,
  req: NextApiRequest,
): Promise<unknown> {
  const targetUrl =
    (req.headers["x-sketrace-target-url"] as string) ??
    "https://api.openai.com/v1/chat/completions";

  const apiKey = req.headers["x-sketrace-api-key"] as string | undefined;

  if (!apiKey) {
    throw new BaseError(
      "BadRequest",
      400,
      "Missing X-Sketrace-Api-Key header. Provide your LLM provider API key.",
      true,
    );
  }

  // Don't stream for cached responses — we need the full response to cache
  const forwardBody = { ...body, stream: false };

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(forwardBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new BaseError(
      "LLMApiError",
      response.status,
      `LLM API error (${response.status}): ${errorBody}`,
      true,
    );
  }

  return response.json();
}
