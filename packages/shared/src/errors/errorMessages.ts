/**
 * Shared error messages that can be used in both client and server contexts
 */

/**
 * Standard message for resource limit errors (memory, timeout, etc.)
 * Used when queries require too many resources to complete
 */
export const RESOURCE_LIMIT_ERROR_MESSAGE = [
  "Your query could not be completed because it required too many resources.",
  "Please narrow your request by adding more specific filters (e.g., a shorter date range).",
].join(" ");
