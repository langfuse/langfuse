import {
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
} from "../../features/inAppAgent/types";
import { recordIncrement } from "../../server";

const RUN_COMPLETED_METRIC = "langfuse.in_app_agent.run.completed";

/**
 * Record a run reaching a settled state. Call this only after the terminal CAS
 * has committed, so a rolled-back transaction cannot inflate the count.
 *
 * `error_code` is "none" rather than absent so Datadog can group every outcome
 * on one tag key.
 */
export function recordRunTerminalOutcome(params: {
  status: InAppAgentRunStatus;
  errorCode?: InAppAgentRunErrorCode | null;
}): void {
  recordIncrement(RUN_COMPLETED_METRIC, 1, {
    status: params.status,
    error_code: params.errorCode ?? "none",
  });
}

/** Terminal error code implied by cancelling a run in the given state. */
export function cancelErrorCodeForStatus(
  status: InAppAgentRunStatus | null,
): InAppAgentRunErrorCode | null {
  if (status === InAppAgentRunStatus.QUEUED) {
    return InAppAgentRunErrorCode.CANCELLED;
  }

  if (status === InAppAgentRunStatus.AWAITING_APPROVAL) {
    return InAppAgentRunErrorCode.APPROVAL_CANCELLED;
  }

  return null;
}
