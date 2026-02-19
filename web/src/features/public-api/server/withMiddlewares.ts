import { isPrismaException } from "@/src/utils/exceptions";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { type NextApiRequest, type NextApiResponse } from "next";
import { type ZodError } from "zod/v4";
import {
  BaseError,
  LangfuseNotFoundError,
  MethodNotAllowedError,
  UnauthorizedError,
} from "@langfuse/shared";
import {
  logger,
  traceException,
  contextWithLangfuseProps,
  ClickHouseResourceError,
} from "@langfuse/shared/src/server";
import * as opentelemetry from "@opentelemetry/api";

// Exported to silence @typescript-eslint/no-unused-vars v8 warning
// (used for type extraction via typeof, which is a legitimate pattern)
export const httpMethods = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
export type HttpMethod = (typeof httpMethods)[number];
type Handlers = {
  [Method in HttpMethod]?: (
    req: NextApiRequest,
    res: NextApiResponse,
  ) => Promise<void>;
};

const defaultHandler = () => {
  throw new MethodNotAllowedError();
};

const CH_ERROR_ADVICE_FULL = [
  ClickHouseResourceError.ERROR_ADVICE_MESSAGE,
  "See https://langfuse.com/docs/api-and-data-platform/features/public-api for more details.",
].join("\n");

export function withMiddlewares(handlers: Handlers) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const ctx = contextWithLangfuseProps({
      headers: req.headers,
    });

    return opentelemetry.context.with(ctx, async () => {
      try {
        await runMiddleware(req, res, cors);

        const method = req.method as HttpMethod;
        if (!handlers[method]) throw new MethodNotAllowedError();

        const finalHandlers: Required<Handlers> = {
          ...{
            GET: defaultHandler,
            POST: defaultHandler,
            PUT: defaultHandler,
            DELETE: defaultHandler,
            PATCH: defaultHandler,
          },
          ...handlers,
        };

        return await finalHandlers[method](req, res);
      } catch (error) {
        if (
          error instanceof LangfuseNotFoundError ||
          error instanceof UnauthorizedError
        ) {
          logger.info(error);
        } else {
          logger.error(error);
        }

        if (error instanceof BaseError) {
          if (error.httpCode >= 500 && error.httpCode < 600) {
            traceException(error);
          }
          return res.status(error.httpCode).json({
            message: error.message,
            error: error.name,
          });
        }

        // Handle ClickHouse resource errors
        if (error instanceof ClickHouseResourceError) {
          const resourceError = error as ClickHouseResourceError;

          logger.warn("ClickHouse resource limit exceeded", {
            errorType: resourceError.errorType,
            message: resourceError.message,
            suggestion: CH_ERROR_ADVICE_FULL,
          });

          return res.status(422).json({
            message: CH_ERROR_ADVICE_FULL,
            error: "Unprocessable Content",
          });
        }

        if (isPrismaException(error)) {
          traceException(error);
          return res.status(500).json({
            message: "Internal Server Error",
            error: "An unknown error occurred",
          });
        }

        // Instanceof check fails here as shared package zod has different instances
        if (isZodError(error)) {
          return res.status(400).json({
            message: "Invalid request data",
            error: error.issues,
          });
        }

        traceException(error);
        return res.status(500).json({
          message: "Internal Server Error",
          error:
            error instanceof Error
              ? error.message
              : "An unknown error occurred",
        });
      }
    });
  };
}

export function isZodError(error: any): error is ZodError {
  return error instanceof Object && error.constructor.name === "ZodError";
}
