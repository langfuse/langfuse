import {
  type ChatMessageWithId,
  type ChatMessage,
  type PlaceholderMessage,
} from "@langfuse/shared";

/**
 * Stable string for a set of playground messages, used to tell whether a window
 * still holds the prompt version it was opened from.
 *
 * `id` is dropped because the provider assigns one to every message while
 * hydrating from the cache, and keys are sorted because equality here must not
 * depend on property order surviving a JSON round trip.
 */
export const getMessagesFingerprint = (
  messages: (ChatMessage | PlaceholderMessage | ChatMessageWithId)[],
): string =>
  JSON.stringify(
    messages.map((message) => {
      const { id: _id, ...rest } = message as ChatMessageWithId;

      return Object.fromEntries(
        Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)),
      );
    }),
  );
