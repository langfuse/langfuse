/**
 * MCP Error Formatting
 *
 * Utilities to format errors for user display in MCP responses.
 * Following Sentry pattern of categorizing and formatting errors appropriately.
 */

import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
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

interface FormattedError {
  code: ErrorCode;
  message: string;
}

/**
 * Map an error to the JSON-RPC error code and the message the caller should
 * see. Shared by formatErrorForUser (protocol errors) and
 * formatErrorMessageForUser (tool execution errors), so both surfaces stay in
 * sync.
 *
 * @param error - The error to format
 * @returns Formatted error code and message
 */
function formatErrorPartsForUser(error: unknown): FormattedError {
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

/**
 * Format an error for MCP response.
 * Returns a properly formatted McpError with appropriate error code.
 *
 * @param error - The error to format
 * @returns Formatted McpError
 */
export function formatErrorForUser(error: unknown): McpError {
  const { code, message } = formatErrorPartsForUser(error);
  return new McpError(code, message);
}

/**
 * Format an error message for display inside a tool result. Unlike
 * formatErrorForUser, the message carries no "MCP error <code>:" prefix.
 *
 * @param error - The error to format
 * @returns Sanitized message for the tool result text
 */
export function formatErrorMessageForUser(error: unknown): string {
  return formatErrorPartsForUser(error).message;
}

/**
 * Wrap a function to catch and format errors for MCP.
 * Prevents errors from bubbling up unformatted.
 *
 * @param fn - Function to wrap
 * @returns Wrapped function that catches and formats errors
 */
export function wrapErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw formatErrorForUser(error);
    }
  }) as T;
}
