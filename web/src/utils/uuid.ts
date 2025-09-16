/**
 * UUID utility functions for converting between different UUID formats
 */

/**
 * Extract UUID from session ID format
 * @param sessionId - Session ID in format like "Session1_01Aug_c3c662e8-8aba-453d-823d-59b9f9a36fdc"
 * @returns UUID with dashes (standard format)
 */
export const extractUuidFromSessionId = (sessionId: string): string => {
  // Extract UUID from session ID format like "Session1_01Aug_c3c662e8-8aba-453d-823d-59b9f9a36fdc"
  // Take everything after the last underscore
  const parts = sessionId.split("_");
  return parts[parts.length - 1];
};

/**
 * Convert UUID without dashes to standard UUID format with dashes
 * @param uuidWithoutDashes - UUID string without dashes (32 characters)
 * @returns UUID with dashes in standard format
 * @throws Error if input is not 32 characters long
 */
export const addDashesToUuid = (uuidWithoutDashes: string): string => {
  // Insert dashes at positions 8, 12, 16, 20 to create standard UUID format
  // Example: "550e8400e29b41d4a716446655440000" -> "550e8400-e29b-41d4-a716-446655440000"
  if (uuidWithoutDashes.length !== 32) {
    throw new Error("Invalid UUID format: must be 32 characters");
  }

  return [
    uuidWithoutDashes.slice(0, 8),
    uuidWithoutDashes.slice(8, 12),
    uuidWithoutDashes.slice(12, 16),
    uuidWithoutDashes.slice(16, 20),
    uuidWithoutDashes.slice(20, 32),
  ].join("-");
};

/**
 * Remove dashes from UUID to create compact format
 * @param uuid - Standard UUID with dashes
 * @returns UUID without dashes
 */
export const removeDashesFromUuid = (uuid: string): string => {
  // Remove all dashes from UUID
  // Example: "550e8400-e29b-41d4-a716-446655440000" -> "550e8400e29b41d4a716446655440000"
  return uuid.replace(/-/g, "");
};

/**
 * Validate if a string is a valid UUID format (with or without dashes)
 * @param uuid - String to validate
 * @returns True if valid UUID format
 */
export const isValidUuid = (uuid: string): boolean => {
  const uuidRegexWithDashes =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uuidRegexWithoutDashes = /^[0-9a-f]{32}$/i;

  return uuidRegexWithDashes.test(uuid) || uuidRegexWithoutDashes.test(uuid);
};
