/**
 * MCP Error Formatting
 *
 * Utilities to format errors for user display in MCP responses.
 * Following Sentry pattern of categorizing and formatting errors appropriately.
 */

import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod/v4";
import { isUserInputError, isApiServerError } from "./errors";
import {
  BaseError,
  UnauthorizedError,
  ForbiddenError,
  LangfuseNotFoundError,
  InvalidRequestError,
} from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";

/**
 * Format an error for MCP response.
 * Returns a properly formatted McpError with appropriate error code.
 *
 * @param error - The error to format
 * @returns Formatted McpError
 */
export function formatErrorForUser(error: unknown): McpError {
  // Log server errors for monitoring (sanitized to avoid PII exposure)
  if (isApiServerError(error)) {
    logger.error("MCP API Server Error", {
      message: error.message,
      name: error.name,
    });
    return new McpError(
      ErrorCode.InternalError,
      "An internal server error occurred. Please try again later.",
    );
  }

  // User input errors - provide helpful message
  if (isUserInputError(error)) {
    return new McpError(ErrorCode.InvalidRequest, error.message);
  }

  // Zod validation errors
  if (error instanceof ZodError) {
    const messages = error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    return new McpError(
      ErrorCode.InvalidParams,
      `Validation failed: ${messages.join(", ")}`,
    );
  }

  // Langfuse standard errors
  if (error instanceof UnauthorizedError) {
    return new McpError(
      ErrorCode.InvalidRequest,
      "Authentication failed. Please check your API key.",
    );
  }

  if (error instanceof ForbiddenError) {
    return new McpError(
      ErrorCode.InvalidRequest,
      "Access forbidden. You do not have permission to access this resource.",
    );
  }

  if (error instanceof LangfuseNotFoundError) {
    return new McpError(ErrorCode.InvalidRequest, error.message);
  }

  if (error instanceof InvalidRequestError) {
    return new McpError(ErrorCode.InvalidRequest, error.message);
  }

  if (error instanceof BaseError) {
    logger.warn("MCP BaseError", error);
    return new McpError(ErrorCode.InvalidRequest, error.message);
  }

  // Generic errors (sanitized logging)
  if (error instanceof Error) {
    logger.error("MCP Unexpected Error", {
      message: error.message,
      name: error.name,
    });
    return new McpError(
      ErrorCode.InternalError,
      "An unexpected error occurred. Please try again later.",
    );
  }

  // Unknown error type (sanitized logging)
  logger.error("MCP Unknown Error Type", {
    errorType: typeof error,
  });
  return new McpError(
    ErrorCode.InternalError,
    "An unexpected error occurred. Please try again later.",
  );
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
