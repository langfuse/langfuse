/**
 * Client-safe utility functions for prompt handling
 */

export interface PromptMessage {
  type?: string;
  name?: string;
  role?: string;
  content?: string;
}

/**
 * Extracts placeholder names from prompt messages.
 * This is a client-safe version that doesn't depend on server-side types.
 * @param messages Array of prompt messages
 * @returns Array of placeholder names
 */
export function extractPlaceholderNames(messages: PromptMessage[]): string[] {
  return messages
    .filter(
      (msg): msg is PromptMessage & { name: string } =>
        msg.type === "placeholder" && typeof msg.name === "string",
    )
    .map((msg) => msg.name);
}
