import { getCompactRepresentationChatML } from "./chatML/getCompactRepresentationChatML";

/**
 * Returns a compact representation of IO data for display in tables.
 * Strategy: Try ChatML extraction if possible.
 *
 * @param io - The input or output data to compact
 * @returns Compact representation or null if no data
 */
export function getCompactRepresentation(io: unknown): {
  success: boolean;
  data: string | any[] | Record<string, any> | null;
} {
  if (io === undefined || io === null) return { success: false, data: null };

  // Parse stringified JSON if needed
  let parsedIO = io;
  if (typeof io === "string") {
    try {
      parsedIO = JSON.parse(io);
    } catch {
      // Continue with original input
    }
  }

  // Try ChatML compact representation extraction
  const chatMLCompact = getCompactRepresentationChatML(parsedIO);
  if (chatMLCompact.success) {
    return { success: true, data: chatMLCompact.data };
  }

  return { success: false, data: null };
}
