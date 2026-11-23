/**
 * Name a conversation carries until it gets a real title. Same wording the
 * server stores when it creates the conversation.
 */
export function getDefaultConversationTitle(startedAt: Date) {
  const weekday = startedAt.toLocaleDateString("en-US", { weekday: "long" });
  const hours = String(startedAt.getHours()).padStart(2, "0");
  const minutes = String(startedAt.getMinutes()).padStart(2, "0");

  return `Chat on ${weekday} at ${hours}:${minutes}`;
}
