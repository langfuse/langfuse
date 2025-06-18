import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod/v4";
import {
  traceException,
  redis,
  logger,
  getCurrentSpan,
  contextWithLangfuseProps,
} from "@langfuse/shared/src/server";
import { telemetry } from "@/src/features/telemetry";
import { jsonSchema } from "@langfuse/shared";
import { isPrismaException } from "@/src/utils/exceptions";
import {
  MethodNotAllowedError,
  BaseError,
  UnauthorizedError,
} from "@langfuse/shared";
import { processEventBatch } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import * as opentelemetry from "@opentelemetry/api";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4.5mb",
    },
  },
};

/**
 * This handler performs multiple actions to ingest data. It is compatible with the new async workflow, but also
 * supports the old synchronous workflow which processes events in the web container.
 * Overall, the processing of each incoming request happens in three stages
 * 1. Validation
 *   - Check that the user has permissions
 *   - Check whether rate-limits are breached
 *   - Check that the request is well-formed
 * 2. Async Processing
 *   - Upload each event to S3 for long-term storage and as an event cache
 *   - Add the event batch to the queue for async processing
 *   - Fallback to sync processing on errors
 * 3. Sync Processing
 * The last two stages live in a processEventBatch function which is reused for the POST scores endpoint and for
 * legacy event types.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const requestStartTime = Date.now();
  try {
    const ctx = contextWithLangfuseProps({
      headers: req.headers,
    });
    // Execute the rest of the handler within the context
    return opentelemetry.context.with(ctx, async () => {
      logger.debug("Ingestion request started", {
        method: req.method,
        contentLength: req.headers["content-length"],
        userAgent: req.headers["user-agent"],
      });

      await runMiddleware(req, res, cors);

      // add context of api call to the span
      const currentSpan = getCurrentSpan();

      // get x-langfuse-xxx headers and add them to the span
      Object.keys(req.headers).forEach((header) => {
        if (
          header.toLowerCase().startsWith("x-langfuse") ||
          header.toLowerCase().startsWith("x_langfuse")
        ) {
          currentSpan?.setAttributes({
            [`langfuse.header.${header.slice(11).toLowerCase().replaceAll("_", "-")}`]:
              req.headers[header],
          });
        }
      });

      if (req.method !== "POST") throw new MethodNotAllowedError();

      // CHECK AUTH FOR ALL EVENTS
      const authStartTime = Date.now();
      const authCheck = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
      logger.debug("Authentication completed", {
        authDurationMs: Date.now() - authStartTime,
        validKey: authCheck.validKey,
      });

      if (!authCheck.validKey) {
        throw new UnauthorizedError(authCheck.error);
      }
      if (!authCheck.scope.projectId) {
        throw new UnauthorizedError(
          "Missing projectId in scope. Are you using an organization key?",
        );
      }

      try {
        const rateLimitStartTime = Date.now();
        const rateLimitCheck =
          await RateLimitService.getInstance().rateLimitRequest(
            authCheck.scope,
            "ingestion",
          );
        logger.debug("Rate limit check completed", {
          rateLimitDurationMs: Date.now() - rateLimitStartTime,
          isRateLimited: rateLimitCheck?.isRateLimited(),
          projectId: authCheck.scope.projectId,
        });

        if (rateLimitCheck?.isRateLimited()) {
          return rateLimitCheck.sendRestResponseIfLimited(res);
        }
      } catch (e) {
        // If rate-limiter returns an error, we log it and continue processing.
        // This allows us to fail open instead of reject requests.
        logger.error("Error while rate limiting", e);
      }

      const batchType = z.object({
        batch: z.array(z.unknown()),
        metadata: jsonSchema.nullish(),
      });

      const validationStartTime = Date.now();
      const parsedSchema = batchType.safeParse(req.body);
      logger.debug("Request validation completed", {
        validationDurationMs: Date.now() - validationStartTime,
        isValid: parsedSchema.success,
        batchSize: parsedSchema.success ? parsedSchema.data.batch.length : 0,
      });

      if (!parsedSchema.success) {
        logger.info("Invalid request data", parsedSchema.error);
        return res.status(400).json({
          message: "Invalid request data",
          errors: parsedSchema.error.issues.map((issue) => issue.message),
        });
      }

      await telemetry();

      logger.info("Starting event batch processing", {
        batchSize: parsedSchema.data.batch.length,
        requestDurationSoFarMs: Date.now() - requestStartTime,
      });

      const processingStartTime = Date.now();
      const result = await processEventBatch(
        parsedSchema.data.batch,
        authCheck,
      );
      const processingDurationMs = Date.now() - processingStartTime;
      const totalDurationMs = Date.now() - requestStartTime;

      logger.info("Event batch processing completed", {
        batchSize: parsedSchema.data.batch.length,
        processingDurationMs,
        totalDurationMs,
        successCount: result.successes.length,
        errorCount: result.errors.length,
      });

      return res.status(207).json(result);
    });
  } catch (error: unknown) {
    const totalDurationMs = Date.now() - requestStartTime;

    if (!(error instanceof UnauthorizedError)) {
      logger.error("error_handling_ingestion_event", {
        totalDurationMs,
        error,
      });
      traceException(error);
    } else {
      logger.debug("Unauthorized ingestion request", {
        totalDurationMs,
        error: error.message,
      });
    }

    if (error instanceof BaseError) {
      return res.status(error.httpCode).json({
        error: error.name,
        message: error.message,
      });
    }

    if (isPrismaException(error)) {
      return res.status(500).json({
        error: "Internal Server Error",
      });
    }

    if (error instanceof z.ZodError) {
      logger.error(`Zod exception`, error.issues);
      return res.status(400).json({
        message: "Invalid request data",
        error: error.issues,
      });
    }

    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    res.status(500).json({
      message: "Invalid request data",
      errors: [errorMessage],
    });
  }
}
