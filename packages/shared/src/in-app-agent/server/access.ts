import { LangfuseNotFoundError } from "../../index";
import type { InAppAgentConversation } from "../../db";

/** Owner-only authorization with a non-enumerating failure. */
export function assertConversationAccess(params: {
  conversation: Pick<InAppAgentConversation, "createdByUserId" | "deletedAt">;
  userId: string;
}): void {
  const { conversation } = params;

  if (
    conversation.deletedAt ||
    conversation.createdByUserId !== params.userId
  ) {
    throw new LangfuseNotFoundError("Agent conversation not found");
  }
}
