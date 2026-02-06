/**
 * OTEL Metrics Ingestion Endpoint
 *
 * This endpoint implements the OTLP/HTTP protocol for metrics ingestion.
 * Per the OTLP spec (https://opentelemetry.io/docs/specs/otlp/#otlphttp-response):
 * - Response encoding should match request encoding
 * - Protobuf requests → application/x-protobuf response
 * - JSON requests → application/json response
 *
 * Note: This is currently a stub endpoint that accepts metrics but does not process them.
 * It returns a successful response to maintain OTEL SDK compatibility.
 *
 * Note: This endpoint does NOT use withMiddlewares()/createAuthedProjectAPIRoute()
 * because those wrappers always return JSON responses regardless of request Content-Type.
 * Instead, we handle authentication, CORS, and rate limiting directly to ensure
 * Content-Type compliance with the OTLP specification.
 */

import { type NextApiRequest, type NextApiResponse } from "next";
import { logger, redis } from "@langfuse/shared/src/server";
import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { prisma } from "@langfuse/shared/src/db";
import { runMiddleware, cors } from "@/src/features/public-api/server/cors";
import {
  getOtelContentType,
  sendOtelMetricsResponse,
  sendOtelMetricsErrorResponse,
  type OtelContentType,
} from "@/src/features/otel/otelResponse";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Capture Content-Type early so all responses respect it
  const contentType: OtelContentType = getOtelContentType(
    req.headers["content-type"],
  );

  try {
    // CORS handling
    await runMiddleware(req, res, cors);

    // Handle preflight OPTIONS request
    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }

    // Method check
    if (req.method !== "POST") {
      return sendOtelMetricsErrorResponse({
        res,
        contentType,
        statusCode: 405,
        message: "Method not allowed",
      });
    }

    // Authentication using ApiAuthService
    const authCheck = await new ApiAuthService(
      prisma,
      redis,
    ).verifyAuthHeaderAndReturnScope(req.headers.authorization);

    if (!authCheck.validKey) {
      throw new UnauthorizedError(authCheck.error);
    }

    // Verify project-scoped access
    if (
      authCheck.scope.accessLevel !== "project" ||
      !authCheck.scope.projectId
    ) {
      throw new ForbiddenError(
        "Access denied: OTEL ingestion requires project-scoped API keys with BasicAuth",
      );
    }

    // Check if ingestion is suspended due to usage threshold
    if (authCheck.scope.isIngestionSuspended) {
      throw new ForbiddenError(
        "Ingestion suspended: Usage threshold exceeded. Please upgrade your plan.",
      );
    }

    // Rate limiting
    const rateLimitCheck =
      await RateLimitService.getInstance().rateLimitRequest(
        authCheck.scope,
        "ingestion",
      );

    if (rateLimitCheck?.isRateLimited()) {
      return rateLimitCheck.sendRestResponseIfLimited(res);
    }

    // Metrics endpoint is a stub - accept but don't process
    // Return successful response to maintain OTEL SDK compatibility
    return sendOtelMetricsResponse({ res, contentType });
  } catch (error) {
    logger.error("OTEL metrics API route error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });

    // Determine appropriate HTTP status based on error type
    let statusCode = 500;
    let message = "Internal server error";

    if (error instanceof UnauthorizedError) {
      statusCode = 401;
      message = error.message || "Unauthorized";
    } else if (error instanceof ForbiddenError) {
      statusCode = 403;
      message = error.message || "Forbidden";
    } else if (error instanceof Error) {
      message = error.message;
    }

    return sendOtelMetricsErrorResponse({
      res,
      contentType,
      statusCode,
      message,
    });
  }
}
