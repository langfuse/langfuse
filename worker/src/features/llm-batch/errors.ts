/**
 * Not a failure: the evaluator's LLM call was handed to a provider batch job.
 * Queue processors set the job execution to DELAYED, record how to resume it
 * and return without an error, a retry or an execution trace.
 */
export class LlmBatchDeferredError extends Error {
  constructor(
    readonly batchRequestId: string,
    readonly projectId: string,
  ) {
    super(`LLM call deferred to batch request ${batchRequestId}`);
    this.name = "LlmBatchDeferredError";
  }
}

export const isLlmBatchDeferredError = (
  error: unknown,
): error is LlmBatchDeferredError => error instanceof LlmBatchDeferredError;
