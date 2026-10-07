import { UnrecoverableError } from "bullmq";
import type { TopicSummary } from "@langfuse/shared/topics";
import {
  getTopicsModels,
  readStagedTopicSummary,
  TOPIC_EMBEDDING_EXPIRED_ERROR,
  updateStagedTopicSummary,
  writeTopicSummaries,
  type TopicEmbeddingBatch,
} from "@langfuse/shared/topics/server";
import { embedTopicSummary } from "./models";
import { TopicMetrics } from "./metrics";
import { mergeTopicModelUsage } from "./summaryResult";
import {
  topicProviderError,
  TopicsProviderUnavailable,
} from "./provider-error";

/** Acknowledging a batch means every result is durably stored in ClickHouse. */
export async function processTopicEmbeddingBatch(
  batch: TopicEmbeddingBatch,
): Promise<void> {
  const metrics = new TopicMetrics();
  const pending: TopicSummary[] = [];
  try {
    const models = await getTopicsModels(batch.projectId);
    if (!models)
      throw new TopicsProviderUnavailable(
        "Choose Topics models for this project, then start a new Topics execution.",
        "authentication",
      );
    for (const ref of batch.summaries) {
      const staged = await readStagedTopicSummary(batch, ref);
      if (!staged) throw new UnrecoverableError(TOPIC_EMBEDDING_EXPIRED_ERROR);
      if (staged.embeddingConfig.embeddingModel !== models.embedding.model)
        throw new TopicsProviderUnavailable(
          "The project's embedding model changed after this batch was created. Start a new Topics execution.",
          "authentication",
        );
      let { summary } = staged;
      if (summary.state === "summarized") {
        const result = await metrics.measure("embedding", async () => {
          try {
            return await embedTopicSummary(
              models.embedding,
              summary.summary,
              staged.embeddingConfig.embeddingDimensions,
            );
          } catch (error) {
            throw error instanceof TopicsProviderUnavailable
              ? error
              : topicProviderError(error, models.embedding);
          }
        });
        summary = {
          ...summary,
          state: "complete",
          embedding: result.embedding,
          ...mergeTopicModelUsage(summary, result),
          processedAt: new Date().toISOString(),
        };
        metrics.result("embedding", "generated");
        // All overlapping attempts must persist the same accepted result.
        const accepted = await updateStagedTopicSummary(batch, ref, summary);
        if (!accepted)
          throw new UnrecoverableError(TOPIC_EMBEDDING_EXPIRED_ERROR);
        pending.push(accepted);
      } else {
        if (summary.state === "complete") metrics.result("embedding", "cached");
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
