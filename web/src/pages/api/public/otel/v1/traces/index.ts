/**
 * OTEL Traces Ingestion Endpoint
 *
 * This endpoint implements the OTLP/HTTP protocol for trace ingestion.
 * Per the OTLP spec (https://opentelemetry.io/docs/specs/otlp/#otlphttp-response):
 * - Response encoding should match request encoding
 * - Protobuf requests → application/x-protobuf response
 * - JSON requests → application/json response
 *
 * Note: This endpoint does NOT use withMiddlewares()/createAuthedProjectAPIRoute()
 * because those wrappers always return JSON responses regardless of request Content-Type.
 * Instead, we handle authentication, CORS, and rate limiting directly to ensure
 * Content-Type compliance with the OTLP specification.
 */

import { type NextApiRequest, type NextApiResponse } from "next";
import {
  logger,
  OtelIngestionProcessor,
  markProjectAsOtelUser,
  redis,
} from "@langfuse/shared/src/server";
import { $root } from "@/src/pages/api/public/otel/otlp-proto/generated/root";
import { gunzip } from "node:zlib";
import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { prisma } from "@langfuse/shared/src/db";
import { runMiddleware, cors } from "@/src/features/public-api/server/cors";
import {
  getOtelContentType,
  sendOtelTraceResponse,
  sendOtelErrorResponse,
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
      return sendOtelErrorResponse({
        res,
        contentType,
        statusCode: 405,
        message: "Method not allowed",
      });
    }

    // Validate Content-Type header for POST requests
    const requestContentType = req.headers["content-type"]?.toLowerCase();
    if (
      !requestContentType ||
      (!requestContentType.includes("application/json") &&
        !requestContentType.includes("application/x-protobuf"))
    ) {
      logger.error(`Invalid content type: ${requestContentType}`);
      return sendOtelErrorResponse({
        res,
        contentType,
        statusCode: 400,
        message: "Invalid content type",
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

    // Mark project as using OTEL API
    await markProjectAsOtelUser(authCheck.scope.projectId);

    // Read request body
    let body: Buffer;
    try {
      body = await new Promise((resolve, reject) => {
        const data: Buffer[] = [];
        req.on("data", (chunk) => data.push(chunk));
        req.on("end", () => resolve(Buffer.concat(data)));
        req.on("error", reject);
      });
    } catch (e) {
      logger.error(`Failed to read request body`, e);
      return sendOtelErrorResponse({
        res,
        contentType,
        statusCode: 400,
        message: "Failed to read request body",
      });
    }

    // Handle gzip compression
    if (req.headers["content-encoding"]?.includes("gzip")) {
      try {
        body = await new Promise((resolve, reject) => {
          gunzip(new Uint8Array(body), (err, result) =>
            err ? reject(err) : resolve(result),
          );
        });
      } catch (e) {
        logger.error(`Failed to decompress request body`, e);
        return sendOtelErrorResponse({
          res,
          contentType,
          statusCode: 400,
          message: "Failed to decompress request body",
        });
      }
    }

    // Parse the body based on Content-Type
    let resourceSpans: any;
    if (requestContentType.includes("application/x-protobuf")) {
      try {
        const parsed =
          $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest.decode(
            body,
          );
        resourceSpans =
          $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest.toObject(
            parsed,
          ).resourceSpans;
      } catch (e) {
        logger.error(`Failed to parse OTel Protobuf`, e);
        return sendOtelErrorResponse({
          res,
          contentType,
          statusCode: 400,
          message: "Failed to parse OTel Protobuf Trace",
        });
      }
    } else if (requestContentType.includes("application/json")) {
      try {
        resourceSpans = JSON.parse(body.toString()).resourceSpans;
      } catch (e) {
        logger.error(`Failed to parse OTel JSON`, e);
        return sendOtelErrorResponse({
          res,
          contentType,
          statusCode: 400,
          message: "Failed to parse OTel JSON Trace",
        });
      }
    }

    // Handle empty resourceSpans
    if (
      !resourceSpans ||
      (Array.isArray(resourceSpans) && resourceSpans.length === 0)
    ) {
      return sendOtelTraceResponse({ res, contentType });
    }

    // Process the spans
    const processor = new OtelIngestionProcessor({
      projectId: authCheck.scope.projectId,
      publicKey: authCheck.scope.publicKey,
    });

    await processor.publishToOtelIngestionQueue(resourceSpans);

    return sendOtelTraceResponse({ res, contentType });
  } catch (error) {
    logger.error("OTEL traces API route error", {
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

    return sendOtelErrorResponse({
      res,
      contentType,
      statusCode,
      message,
    });
  }
}
