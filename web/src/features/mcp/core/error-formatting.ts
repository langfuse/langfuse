/**
 * MCP Error Formatting
 *
 * Utilities to format errors for user display in MCP responses.
 * Following Sentry pattern of categorizing and formatting errors appropriately.
 */

import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";
import { isUserInputError, isApiServerError } from "./errors";
import {
  BaseError,
  UnauthorizedError,
  ForbiddenError,
  LangfuseNotFoundError,
  InvalidRequestError,
} from "@langfuse/shared";
import { ClickHouseResourceError, logger } from "@langfuse/shared/src/server";

/**
 * Sanitize errors independently of whether the caller returns a tool result
 * or a protocol error. Call only at the response boundary, not inside handlers.
 */
export function formatErrorForUser(error: unknown): {
  code: ErrorCode;
  message: string;
} {
  // Log server errors for monitoring (sanitized to avoid PII exposure)
  if (isApiServerError(error)) {
    logger.error("MCP API Server Error", {
      message: error.message,
      name: error.name,
    });
    return {
      code: ErrorCode.InternalError,
      message: "An internal server error occurred. Please try again later.",
    };
  }

  // User input errors - provide helpful message
  if (isUserInputError(error)) {
    return { code: ErrorCode.InvalidRequest, message: error.message };
  }

  // Zod validation errors
  if (error instanceof ZodError) {
    const messages = error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    return {
      code: ErrorCode.InvalidParams,
      message: `Validation failed: ${messages.join(", ")}`,
    };
  }

  // Langfuse standard errors
  if (error instanceof UnauthorizedError) {
    return {
      code: ErrorCode.InvalidRequest,
      message: "Authentication failed. Please check your API key.",
    };
  }

  if (error instanceof ForbiddenError) {
    return { code: ErrorCode.InvalidRequest, message: error.message };
  }

  if (error instanceof LangfuseNotFoundError) {
    return { code: ErrorCode.InvalidRequest, message: error.message };
  }

  if (error instanceof InvalidRequestError) {
    return { code: ErrorCode.InvalidRequest, message: error.message };
  }

  if (error instanceof ClickHouseResourceError) {
    logger.warn("MCP ClickHouse resource limit exceeded", {
      errorType: error.errorType,
      tags: error.tags,
    });
    return {
      code: ErrorCode.InvalidRequest,
      message:
        error.errorType === "TIMEOUT"
          ? "The ClickHouse query timed out. Narrow the query by shortening the date range or adding more specific filters before trying again."
          : ClickHouseResourceError.ERROR_ADVICE_MESSAGE,
    };
  }

  if (error instanceof BaseError && error.httpCode >= 500) {
    logger.error("MCP BaseError (server-side)", {
      name: error.name,
      httpCode: error.httpCode,
    });
    return {
      code: ErrorCode.InternalError,
      message: "An internal server error occurred. Please try again later.",
    };
  }

  if (error instanceof BaseError) {
    logger.warn("MCP BaseError", error);
    return { code: ErrorCode.InvalidRequest, message: error.message };
  }

  // Generic errors (sanitized logging)
  if (error instanceof Error) {
    logger.error("MCP Unexpected Error", {
      message: error.message,
      name: error.name,
    });
    return {
      code: ErrorCode.InternalError,
      message: "An unexpected error occurred. Please try again later.",
    };
  }

  // Unknown error type (sanitized logging)
  logger.error("MCP Unknown Error Type", {
    errorType: typeof error,
  });
  return {
    code: ErrorCode.InternalError,
    message: "An unexpected error occurred. Please try again later.",
  };
}
