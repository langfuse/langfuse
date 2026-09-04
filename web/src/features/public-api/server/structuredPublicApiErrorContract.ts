import { type NextApiResponse } from "next";
import { type ZodError } from "zod";
import {
  BaseError,
  InvalidRequestError,
  InternalServerError,
  ForbiddenError,
  LangfuseConflictError,
  LangfuseNotFoundError,
  MethodNotAllowedError,
  UnauthorizedError,
  type RateLimitResult,
} from "@langfuse/shared";
import { ClickHouseResourceError } from "@langfuse/shared/src/server";
import {
  createStructuredPublicApiError,
  StructuredPublicApiError,
} from "@/src/features/public-api/types/structuredPublicApiError";
import type {
  StructuredPublicApiErrorCodeType,
  StructuredPublicApiErrorDetailsType,
} from "@/src/features/public-api/types/structuredPublicApiErrorSchema";
import {
  getRateLimitUpgradeMessage,
  type RateLimitUpgradePath,
} from "@/src/features/public-api/server/rateLimitUpgradePaths";

export const structuredPublicApiErrorContract = "structured";
export type PublicApiErrorContract = typeof structuredPublicApiErrorContract;

type StructuredPublicApiErrorBody = {
  message: string;
  code: StructuredPublicApiErrorCodeType;
  details?: StructuredPublicApiErrorDetailsType;
};

export { StructuredPublicApiError };

function toBody(error: StructuredPublicApiError): StructuredPublicApiErrorBody {
  return {
    message: error.message,
    code: error.code,
    ...(error.details !== undefined ? { details: error.details } : {}),
  };
}

function toSerializableIssues(issues: ZodError["issues"]) {
  return issues.map((issue) => ({
    ...issue,
    path: issue.path.filter(
      (segment): segment is string | number =>
        typeof segment === "string" || typeof segment === "number",
    ),
  }));
}

export function sendStructuredPublicApiErrorResponse(
  res: NextApiResponse,
  error: StructuredPublicApiError,
) {
  return res.status(error.httpCode).json(toBody(error));
}

export function createStructuredPublicApiAuthError(params: {
  statusCode: number;
  message: string;
}) {
  switch (params.statusCode) {
    case 400:
      return createStructuredPublicApiError({
        httpCode: 400,
        code: "invalid_request",
        message: params.message,
      });
    case 401:
      return createStructuredPublicApiError({
        httpCode: 401,
        code: "authentication_failed",
        message: params.message,
      });
    case 403:
      return createStructuredPublicApiError({
        httpCode: 403,
        code: "access_denied",
        message: params.message,
      });
    case 404:
      return createStructuredPublicApiError({
        httpCode: 404,
        code: "resource_not_found",
        message: params.message,
      });
    default:
      return createStructuredPublicApiError({
        httpCode: params.statusCode,
        code: params.statusCode >= 500 ? "internal_error" : "invalid_request",
        message: params.message,
      });
  }
}

export function createStructuredPublicApiRateLimitError(
  rateLimitRes: RateLimitResult,
  options?: {
    errorContract?: PublicApiErrorContract;
    upgradePath?: RateLimitUpgradePath;
  },
) {
  return createStructuredPublicApiError({
    httpCode: 429,
    code: "rate_limited",
    message: options?.upgradePath
      ? getRateLimitUpgradeMessage(options.upgradePath)
      : "Rate limit exceeded",
    details: {
      retryAfterSeconds: Math.ceil(rateLimitRes.msBeforeNext / 1000),
      limit: rateLimitRes.points,
      remaining: Math.max(0, rateLimitRes.remainingPoints),
      resetAt: new Date(Date.now() + rateLimitRes.msBeforeNext).toISOString(),
    },
  });
}

export function createStructuredPublicApiRequestValidationError(params: {
  error: ZodError;
  requestPart: "query" | "body";
}) {
  return createStructuredPublicApiError({
    httpCode: 400,
    code: params.requestPart === "query" ? "invalid_query" : "invalid_body",
    message:
      params.requestPart === "query"
        ? "Invalid query parameters"
        : "Invalid request body",
    details: {
      issues: toSerializableIssues(params.error.issues),
    },
  });
}

export function toStructuredPublicApiError(
  error: unknown,
): StructuredPublicApiError {
  if (error instanceof StructuredPublicApiError) {
    return error;
  }

  if (
    error instanceof Object &&
    error.constructor.name === "ZodError" &&
    "issues" in error
  ) {
    return createStructuredPublicApiError({
      httpCode: 400,
      code: "invalid_request",
      message: "Invalid request data",
      details: {
        issues: toSerializableIssues(error.issues as ZodError["issues"]),
      },
    });
  }

  if (error instanceof LangfuseNotFoundError) {
    return createStructuredPublicApiError({
      httpCode: 404,
      code: "resource_not_found",
      message: error.message,
    });
  }

  if (error instanceof UnauthorizedError) {
    return createStructuredPublicApiError({
      httpCode: 403,
      code: "access_denied",
      message: error.message,
    });
  }

  if (error instanceof ForbiddenError) {
    return createStructuredPublicApiError({
      httpCode: 403,
      code: "access_denied",
      message: error.message,
    });
  }

  if (error instanceof MethodNotAllowedError) {
    return createStructuredPublicApiError({
      httpCode: 405,
      code: "method_not_allowed",
      message: error.message,
    });
  }

  if (error instanceof LangfuseConflictError) {
    return createStructuredPublicApiError({
      httpCode: 409,
      code: "conflict",
      message: error.message,
    });
  }

  if (error instanceof InvalidRequestError) {
    return createStructuredPublicApiError({
      httpCode: 400,
      code: "invalid_request",
      message: error.message,
    });
  }

  if (error instanceof ClickHouseResourceError) {
    return createStructuredPublicApiError({
      httpCode: 422,
      code: "invalid_request",
      message: [
        ClickHouseResourceError.ERROR_ADVICE_MESSAGE,
        "See https://langfuse.com/docs/api-and-data-platform/features/public-api for more details.",
      ].join("\n"),
    });
  }

  if (error instanceof InternalServerError) {
    return createStructuredPublicApiError({
      httpCode: 500,
      code: "internal_error",
      message: error.message,
    });
  }

  if (error instanceof BaseError) {
    return createStructuredPublicApiError({
      httpCode: error.httpCode,
      code: error.httpCode >= 500 ? "internal_error" : "invalid_request",
      message: error.message,
    });
  }

  return createStructuredPublicApiError({
    httpCode: 500,
    code: "internal_error",
    message: "Internal Server Error",
  });
}
