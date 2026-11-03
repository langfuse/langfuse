/** One captured provider request inside a batch job. */
export type LlmBatchItem = {
  /** Our row id; echoed back by the provider to match results. */
  id: string;
  /** Provider request body exactly as the AI SDK built it. */
  request: Record<string, unknown>;
};

export type LlmBatchItemResult =
  | { ok: true; response: unknown }
  | { ok: false; error: string };

export type LlmBatchPollResult =
  | { state: "running" }
  | {
      state: "done";
      /** Results by item id. Items missing here got no result. */
      results: Map<string, LlmBatchItemResult>;
      /** Set when the job as a whole failed, was cancelled or expired. */
      jobError?: string;
    };

/** A provider's batch API, reduced to what the batch tick needs. */
export interface LlmBatchProvider {
  /** Submits one batch job and returns its provider id. */
  submit(params: {
    model: string;
    items: LlmBatchItem[];
    /**
     * Unique name for this submission: lowercase letters, digits, "-" and
     * "_", at most 63 characters. Used for object paths and stored on the
     * provider job, so `findJob` can recover a job whose id was never saved.
     */
    submissionId: string;
  }): Promise<string>;
  /** The provider id of the job submitted as `submissionId`, if any. */
  findJob(submissionId: string): Promise<string | null>;
  poll(providerJobId: string): Promise<LlmBatchPollResult>;
}
