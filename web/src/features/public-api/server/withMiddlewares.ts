import { isPrismaException } from "@/src/utils/exceptions";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { type NextApiRequest, type NextApiResponse } from "next";
import { type ZodError } from "zod";
import {
  type BaseError,
  isBaseError,
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
import {
  sendUnstablePublicApiErrorResponse,
  toUnstablePublicApiError,
  unstablePublicEvalsErrorContract,
  type PublicApiErrorContract,
} from "@/src/features/public-api/server/unstable-public-api-error-contract";
import { clickHouseRouteForRequest } from "@/src/features/public-api/server/clickHouseRequestTags";

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

const DEFAULT_CLICKHOUSE_RESOURCE_ERROR_MESSAGE = [
  ClickHouseResourceError.ERROR_ADVICE_MESSAGE,
  "See https://langfuse.com/docs/api-and-data-platform/features/public-api for more details.",
].join("\n");

export const LEGACY_PUBLIC_API_OBSERVATIONS_CLICKHOUSE_RESOURCE_ERROR_MESSAGE =
  [
    ClickHouseResourceError.ERROR_ADVICE_MESSAGE,
    "This legacy endpoint can be slow. Please migrate to the high-performance Observations API v2 at /api/public/v2/observations.",
    "This applies to Langfuse Cloud only until v4 is released in OSS.",
    "Docs: https://langfuse.com/docs/api-and-data-platform/features/observations-api",
  ].join("\n");

export const LEGACY_PUBLIC_API_METRICS_CLICKHOUSE_RESOURCE_ERROR_MESSAGE = [
  ClickHouseResourceError.ERROR_ADVICE_MESSAGE,
  "This legacy endpoint can be slow. Please migrate to the high-performance Metrics API v2 at /api/public/v2/metrics.",
  "This applies to Langfuse Cloud only until v4 is released in OSS.",
  "Docs: https://langfuse.com/docs/metrics/features/metrics-api",
].join("\n");

type MiddlewareOptions = {
  errorContract?: PublicApiErrorContract;
  clickHouseResourceErrorMessage?: string;
};

const logBaseError = (error: BaseError) => {
  if (
    error instanceof LangfuseNotFoundError ||
    error instanceof UnauthorizedError
  ) {
    logger.info(error);
    return;
  }

  if (error.isUserError()) {
    logger.warn(error);
    return;
  }

  logger.error(error);
};

export function withMiddlewares(
  handlers: Handlers,
  options?: MiddlewareOptions,
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const ctx = contextWithLangfuseProps({
      headers: req.headers,
      clickhouse: {
        surface: "publicapi",
        route: clickHouseRouteForRequest(req),
      },
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
        if (error instanceof ClickHouseResourceError) {
          const errorMessage =
            options?.clickHouseResourceErrorMessage ??
            DEFAULT_CLICKHOUSE_RESOURCE_ERROR_MESSAGE;

          logger.warn("ClickHouse resource limit exceeded", {
            errorType: error.errorType,
            message: error.message,
            suggestion: errorMessage,
            tags: error.tags,
          });

          if (options?.errorContract === unstablePublicEvalsErrorContract) {
            return sendUnstablePublicApiErrorResponse(
              res,
              toUnstablePublicApiError(error),
            );
          }

          return res.status(422).json({
            message: errorMessage,
            error: "Request timed out",
          });
        }

        if (options?.errorContract === unstablePublicEvalsErrorContract) {
          if (isBaseError(error)) {
            logBaseError(error);
          } else if (isZodError(error)) {
            logger.warn(error);
          } else {
            logger.error(error);
          }

          if (isBaseError(error)) {
            if (error.httpCode >= 500 && error.httpCode < 600) {
              traceException(error);
            }
          } else if (!isZodError(error)) {
            traceException(error);
          }

          return sendUnstablePublicApiErrorResponse(
            res,
            toUnstablePublicApiError(error),
          );
        }

        if (isBaseError(error)) {
          logBaseError(error);
          if (error.httpCode >= 500 && error.httpCode < 600) {
            traceException(error);
          }
          return res.status(error.httpCode).json({
            message: error.message,
            error: error.name,
          });
        }

        if (isPrismaException(error)) {
          logger.error(error);
          traceException(error);
          return res.status(500).json({
            message: "Internal Server Error",
            error: "An unknown error occurred",
          });
        }

        // Instanceof check fails here as shared package zod has different instances
        if (isZodError(error)) {
          logger.warn(error);
          return res.status(400).json({
            message: "Invalid request data",
            error: error.issues,
          });
        }

        logger.error(error);
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
