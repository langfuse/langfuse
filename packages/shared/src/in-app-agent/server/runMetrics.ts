import { InAppAgentRunErrorCode } from "../../features/inAppAgent/types";
import { recordIncrement } from "../../server";
import type { SettledInAppAgentRunStatus } from "../constants";

const RUN_COMPLETED_METRIC = "langfuse.in_app_agent.run.completed";

/**
 * Record a run reaching a settled state. Call this only after the terminal CAS
 * has committed, so a rolled-back transaction cannot inflate the count.
 *
 * Settledness is the complement of `IN_APP_AGENT_UNSETTLED_RUN_STATUSES` in
 * constants.ts. `AWAITING_APPROVAL` is parked, not settled; emitting on the
 * park would double-count when the parent later becomes SUCCEEDED, FAILED, or
 * CANCELLED.
 *
 * `error_code` is "none" rather than absent so Datadog can group every outcome
 * on one tag key.
 */
export function recordRunTerminalOutcome(params: {
  status: SettledInAppAgentRunStatus;
  errorCode?: InAppAgentRunErrorCode | null;
}): void {
  recordIncrement(RUN_COMPLETED_METRIC, 1, {
    status: params.status,
    error_code: params.errorCode ?? "none",
  });
}
