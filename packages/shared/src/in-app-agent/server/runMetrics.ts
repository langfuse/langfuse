import {
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
} from "../../features/inAppAgent/types";
import { logger, recordIncrement } from "../../server";
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
 *
 * Failed outcomes also emit one structured info log. The metric cannot carry
 * the error text; the log is what the Datadog failed-run table queries, and
 * Winston attaches `dd.trace_id` so a row can jump to the APM trace.
 */
export function recordRunTerminalOutcome(params: {
  status: SettledInAppAgentRunStatus;
  errorCode?: InAppAgentRunErrorCode | null;
  projectId?: string;
  runId?: string;
  conversationId?: string;
  errorMessage?: string | null;
}): void {
  recordIncrement(RUN_COMPLETED_METRIC, 1, {
    status: params.status,
    error_code: params.errorCode ?? "none",
  });

  if (params.status !== InAppAgentRunStatus.FAILED) {
    return;
  }

  logger.info("In-app agent run failed", {
    projectId: params.projectId,
    runId: params.runId,
    conversationId: params.conversationId,
    errorCode: params.errorCode ?? "none",
    errorMessage: params.errorMessage ?? undefined,
  });
}
