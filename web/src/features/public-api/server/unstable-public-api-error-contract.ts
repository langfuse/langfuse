import { type NextApiResponse } from "next";
import { type ZodError } from "zod";
import {
  BaseError,
  InvalidRequestError,
  InternalServerError,
  LangfuseConflictError,
  LangfuseNotFoundError,
  MethodNotAllowedError,
  UnauthorizedError,
  type RateLimitResult,
} from "@langfuse/shared";
import { ClickHouseResourceError } from "@langfuse/shared/src/server";
import type {
  UnstablePublicApiErrorCodeType,
  UnstablePublicApiErrorDetailsType,
} from "@/src/features/public-api/shared/unstable-public-api-error-schema";

export const unstablePublicEvalsErrorContract = "unstable-public-evals";
export type PublicApiErrorContract = typeof unstablePublicEvalsErrorContract;

type UnstablePublicApiErrorBody = {
  message: string;
  code: UnstablePublicApiErrorCodeType;
  details?: UnstablePublicApiErrorDetailsType;
};

export class UnstablePublicApiError extends BaseError {
  public readonly code: UnstablePublicApiErrorCodeType;
  public readonly details?: UnstablePublicApiErrorDetailsType;

  constructor(params: {
    httpCode: number;
    code: UnstablePublicApiErrorCodeType;
    message: string;
    details?: UnstablePublicApiErrorDetailsType;
  }) {
    super("UnstablePublicApiError", params.httpCode, params.message, true);
    this.code = params.code;
    this.details = params.details;
  }
}

function toBody(error: UnstablePublicApiError): UnstablePublicApiErrorBody {
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

export function sendUnstablePublicApiErrorResponse(
  res: NextApiResponse,
  error: UnstablePublicApiError,
) {
  return res.status(error.httpCode).json(toBody(error));
}

export function createUnstablePublicApiError(params: {
  httpCode: number;
  code: UnstablePublicApiErrorCodeType;
  message: string;
  details?: UnstablePublicApiErrorDetailsType;
}) {
  return new UnstablePublicApiError(params);
}

export function createUnstablePublicApiAuthError(params: {
  statusCode: number;
  message: string;
}) {
  switch (params.statusCode) {
    case 400:
      return createUnstablePublicApiError({
        httpCode: 400,
        code: "invalid_request",
        message: params.message,
      });
    case 401:
      return createUnstablePublicApiError({
        httpCode: 401,
        code: "authentication_failed",
        message: params.message,
      });
    case 403:
      return createUnstablePublicApiError({
        httpCode: 403,
        code: "access_denied",
        message: params.message,
      });
    case 404:
      return createUnstablePublicApiError({
        httpCode: 404,
        code: "resource_not_found",
        message: params.message,
      });
    default:
      return createUnstablePublicApiError({
        httpCode: params.statusCode,
        code: params.statusCode >= 500 ? "internal_error" : "invalid_request",
        message: params.message,
      });
  }
}

export function createUnstablePublicApiRateLimitError(
  rateLimitRes: RateLimitResult,
) {
  return createUnstablePublicApiError({
    httpCode: 429,
    code: "rate_limited",
    message: "Rate limit exceeded",
    details: {
      retryAfterSeconds: Math.ceil(rateLimitRes.msBeforeNext / 1000),
      limit: rateLimitRes.points,
      remaining: rateLimitRes.remainingPoints,
      resetAt: new Date(Date.now() + rateLimitRes.msBeforeNext).toISOString(),
    },
  });
}

export function createUnstablePublicApiRequestValidationError(params: {
  error: ZodError;
  requestPart: "query" | "body";
}) {
  return createUnstablePublicApiError({
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

export function toUnstablePublicApiError(
  error: unknown,
): UnstablePublicApiError {
  if (error instanceof UnstablePublicApiError) {
    return error;
  }

  if (
    error instanceof Object &&
    error.constructor.name === "ZodError" &&
    "issues" in error
  ) {
    return createUnstablePublicApiError({
      httpCode: 400,
      code: "invalid_request",
      message: "Invalid request data",
      details: {
        issues: toSerializableIssues(error.issues as ZodError["issues"]),
      },
    });
  }

  if (error instanceof LangfuseNotFoundError) {
    return createUnstablePublicApiError({
      httpCode: 404,
      code: "resource_not_found",
      message: error.message,
    });
  }

  if (error instanceof UnauthorizedError) {
    return createUnstablePublicApiError({
      httpCode: 403,
      code: "access_denied",
      message: error.message,
    });
  }

  if (error instanceof MethodNotAllowedError) {
    return createUnstablePublicApiError({
      httpCode: 405,
      code: "method_not_allowed",
      message: error.message,
    });
  }

  if (error instanceof LangfuseConflictError) {
    return createUnstablePublicApiError({
      httpCode: 409,
      code: "conflict",
      message: error.message,
    });
  }

  if (error instanceof InvalidRequestError) {
    return createUnstablePublicApiError({
      httpCode: 400,
      code: "invalid_request",
      message: error.message,
    });
  }

  if (error instanceof ClickHouseResourceError) {
    return createUnstablePublicApiError({
      httpCode: 422,
      code: "unprocessable_content",
      message: [
        ClickHouseResourceError.ERROR_ADVICE_MESSAGE,
        "See https://langfuse.com/docs/api-and-data-platform/features/public-api for more details.",
      ].join("\n"),
    });
  }

  if (error instanceof InternalServerError) {
    return createUnstablePublicApiError({
      httpCode: 500,
      code: "internal_error",
      message: error.message,
    });
  }

  if (error instanceof BaseError) {
    return createUnstablePublicApiError({
      httpCode: error.httpCode,
      code: error.httpCode >= 500 ? "internal_error" : "invalid_request",
      message: error.message,
    });
  }

  return createUnstablePublicApiError({
    httpCode: 500,
    code: "internal_error",
    message: "Internal Server Error",
  });
}
