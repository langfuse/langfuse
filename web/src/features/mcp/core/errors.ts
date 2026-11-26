import { InvalidRequestError } from "@langfuse/shared";

/**
 * MCP Error Classes
 *
 * Following Sentry MCP pattern:
 * - UserInputError: 4xx-like errors that user can fix (invalid input, not found, etc.)
 * - ApiServerError: 5xx-like errors that should be logged to monitoring
 */

/**
 * Error that indicates user input is invalid or incorrect.
 * These errors should be formatted for user display and not logged as server errors.
 *
 * Examples:
 * - Invalid prompt name
 * - Prompt not found
 * - Invalid version number
 * - Missing required fields
 */
export class UserInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserInputError";
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UserInputError);
    }
  }
}

/**
 * Error that indicates an internal server problem.
 * These errors should be logged to monitoring systems.
 *
 * Examples:
 * - Database connection failure
 * - Redis unavailable
 * - Unexpected null value
 * - Third-party API failure
 */
export class ApiServerError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApiServerError";
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiServerError);
    }
  }
}

/**
 * Error raised while a project's MCP observation searches are paused after a
 * query exceeded ClickHouse resource limits. Recorded as the `throttled`
 * outcome so pauses stay separate from invalid requests in telemetry.
 */
export class McpQueryCooldownError extends InvalidRequestError {
  readonly retryAfterSeconds: number;

  constructor(seconds: number) {
    const retryAfterSeconds = Math.max(1, seconds);
    super(
      `MCP observation searches for this project are paused after a query exceeded resource limits. Retry in ${retryAfterSeconds}s with a shorter date range or more specific filters, and run searches sequentially.`,
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Type guard to check if an error is a UserInputError
 */
export function isUserInputError(error: unknown): error is UserInputError {
  return error instanceof UserInputError;
}

/**
 * Type guard to check if an error is an ApiServerError
 */
export function isApiServerError(error: unknown): error is ApiServerError {
  return error instanceof ApiServerError;
}
