import { getCompactRepresentationChatML } from "./chatML/getCompactRepresentationChatML";

/**
 * Returns a compact representation of IO data for display in tables.
 * Strategy: Try ChatML extraction first, fall back to truncation.
 *
 * @param io - The input or output data to compact
 * @param maxChars - Maximum characters to return when truncating (default: 1000)
 * @returns Compact representation or null if no data
 */
export function getCompactRepresentation(io: unknown, maxChars: number = 1000) {
  if (io === undefined || io === null) return null;

  // Parse stringified JSON if needed
  let parsedIO = io;
  if (typeof io === "string") {
    try {
      parsedIO = JSON.parse(io);
    } catch {
      // Not valid JSON - will truncate the string as-is
    }
  }

  // Try ChatML compact representation extraction first
  const chatMLCompact = getCompactRepresentationChatML(parsedIO);
  if (chatMLCompact.success) {
    return chatMLCompact.data;
  }

  // Fallback: truncate original input
  try {
    const ioStr = typeof io === "string" ? io : JSON.stringify(io);
    return ioStr.substring(0, maxChars);
  } catch (error) {
    // If stringification fails, return original input
    return io;
  }
}
