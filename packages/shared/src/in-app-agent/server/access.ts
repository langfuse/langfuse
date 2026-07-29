import { LangfuseNotFoundError } from "../../index";
import type { InAppAgentConversation } from "../../db";

/**
 * The single authorization seam for in-app agent conversations.
 *
 * v1 is owner-only for every action — watch (history + live tail), submit,
 * cancel and decide all require `conversation.createdByUserId === userId`,
 * exactly the rule the foreground path already enforced. Background
 * execution must not silently widen the sharing surface, so the actions are
 * spelled out here rather than collapsed into one boolean: enabling
 * `visibilityScope: PROJECT` later is a change in this module only.
 *
 * The pre-decided direction for that future (do not relitigate it there):
 * watch = any project member, submit = creator, cancel = creator + project
 * admin, decide = creator only — the approved mutation executes on behalf of
 * whoever triggered the run, and a colleague approving someone else's pending
 * write is a confused-deputy shape to open only deliberately.
 */
export type InAppAgentConversationAction =
  | "watch"
  | "submit"
  | "cancel"
  | "decide";

export function assertConversationAccess(params: {
  action: InAppAgentConversationAction;
  conversation: Pick<InAppAgentConversation, "createdByUserId" | "deletedAt">;
  userId: string;
}): void {
  const { conversation } = params;

  // Deliberately the same error for "does not exist", "deleted" and "not
  // yours": a conversation the caller cannot access must not be
  // distinguishable from one that is not there.
  if (
    conversation.deletedAt ||
    conversation.createdByUserId !== params.userId
  ) {
    throw new LangfuseNotFoundError("Agent conversation not found");
  }
}
