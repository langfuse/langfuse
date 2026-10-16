import { isInAppAgentToolWithInputs } from "@langfuse/shared/in-app-agent";

import type {
  BackgroundExecutionApprovalView,
  BackgroundExecutionView,
} from "../lib/backgroundExecutionSession";

/**
 * The server forgets an approval once it is decided, so a snapshot taken
 * before the resumed run posts the tool result drops an approval the user
 * just answered. Keep answered approvals of tools that take input while that
 * run still executes and the snapshot has not caught up with them.
 */
export function getApprovalsAwaitingResult(params: {
  approvals: readonly BackgroundExecutionApprovalView[];
  hydrated: Pick<BackgroundExecutionView, "messages" | "pendingToolApprovals">;
  isRunExecuting: boolean;
}): BackgroundExecutionApprovalView[] {
  if (!params.isRunExecuting) {
    return [];
  }

  const knownToolCallIds = new Set([
    ...params.hydrated.pendingToolApprovals.map(
      (pending) => pending.approvalRequest.toolCallId,
    ),
    ...params.hydrated.messages.flatMap((message) =>
      message.role === "tool" ? [message.toolCallId] : [],
    ),
  ]);

  return params.approvals.filter(
    (pending) =>
      pending.status === "submitting" &&
      isInAppAgentToolWithInputs(pending.approvalRequest.toolName) &&
      !knownToolCallIds.has(pending.approvalRequest.toolCallId),
  );
}
