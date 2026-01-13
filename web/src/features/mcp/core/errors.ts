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
