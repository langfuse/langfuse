import { UnrecoverableError } from "bullmq";
import type { TopicSummary } from "@langfuse/shared/topics";
import {
  readStagedTopicSummary,
  TOPIC_EMBEDDING_EXPIRED_ERROR,
  updateStagedTopicSummary,
  writeTopicSummaries,
  type TopicEmbeddingBatch,
} from "@langfuse/shared/topics/server";
import { embedTopicSummary } from "./models";
import { TopicMetrics } from "./metrics";
import {
  topicProviderError,
  TopicsProviderUnavailable,
} from "./provider-error";

function mergeDetails(
  summary: Record<string, number>,
  embedding: Record<string, number>,
): Record<string, number> {
  const details = { ...summary, ...embedding };
  if (Object.keys(details).length)
    details.total =
      (summary.total ??
        Object.values(summary).reduce((sum, value) => sum + value, 0)) +
      (embedding.total ??
        Object.values(embedding).reduce((sum, value) => sum + value, 0));
  return details;
}

/** Acknowledging a batch means every result is durably stored in ClickHouse. */
export async function processTopicEmbeddingBatch(
  batch: TopicEmbeddingBatch,
): Promise<void> {
  const metrics = new TopicMetrics();
  const pending: TopicSummary[] = [];
  try {
    for (const ref of batch.summaries) {
      const staged = await readStagedTopicSummary(batch, ref);
      if (!staged) throw new UnrecoverableError(TOPIC_EMBEDDING_EXPIRED_ERROR);
      let { summary } = staged;
      if (summary.state === "summarized") {
        const result = await metrics.measure("embedding", async () => {
          try {
            return await embedTopicSummary(
              summary.summary,
              staged.embeddingConfig.embeddingDimensions,
            );
          } catch (error) {
            throw error instanceof TopicsProviderUnavailable
              ? error
              : topicProviderError(error);
          }
        });
        summary = {
          ...summary,
          state: "complete",
          embedding: result.embedding,
          providedUsageDetails: mergeDetails(
            summary.providedUsageDetails,
            result.providedUsageDetails,
          ),
          usageDetails: mergeDetails(summary.usageDetails, result.usageDetails),
          providedCostDetails: mergeDetails(
            summary.providedCostDetails,
            result.providedCostDetails,
          ),
          costDetails: mergeDetails(summary.costDetails, result.costDetails),
          processedAt: new Date().toISOString(),
        };
        metrics.embeddingResult(summary.id, "generated");
        // All overlapping attempts must persist the same accepted result.
        const accepted = await updateStagedTopicSummary(batch, ref, summary);
        if (!accepted)
          throw new UnrecoverableError(TOPIC_EMBEDDING_EXPIRED_ERROR);
        pending.push(accepted);
      } else {
        if (summary.state === "complete")
          metrics.embeddingResult(summary.id, "cached");
        pending.push(summary);
      }
    }
  } catch (error) {
    if (
      error instanceof TopicsProviderUnavailable &&
      ["authentication", "invalid_input", "invalid_output"].includes(
        error.reason,
      )
    )
      throw new UnrecoverableError(error.message);
    throw error;
  } finally {
    if (pending.length)
      await metrics.measure(
        "storage",
        () => writeTopicSummaries(pending),
        "storage",
      );
    // The processing job retains Redis results until assignment is acknowledged.
    // Retrying a partial insert reuses these vectors and their processing time.
  }
}
