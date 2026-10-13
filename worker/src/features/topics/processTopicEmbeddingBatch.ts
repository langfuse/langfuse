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
import { embedTopicSummaries } from "./models";
import { TopicMetrics } from "./metrics";
import { mergeTopicModelUsage } from "./summaryResult";
import {
  isRejectedConnection,
  pauseForRejectedConnection,
  topicProviderError,
  TopicsProviderUnavailable,
} from "./provider-error";

/** Acknowledging a batch means every result is durably stored in ClickHouse. */
export async function processTopicEmbeddingBatch(
  batch: TopicEmbeddingBatch,
): Promise<void> {
  const metrics = new TopicMetrics();
  // Batch order; rows still `summarized` are not persisted.
  const rows: {
    ref: TopicEmbeddingBatch["summaries"][number];
    summary: TopicSummary;
  }[] = [];
  try {
    const models = await getTopicsModels(batch.projectId);
    if (!models)
      throw new TopicsProviderUnavailable(
        "Choose Topics models for this project, then start a new Topics execution.",
        "configuration",
      );
    // Every summary in a batch belongs to one execution's embedding configuration.
    let dimensions = models.embedding.dimensions;
    for (const ref of batch.summaries) {
      const staged = await readStagedTopicSummary(batch, ref);
      if (!staged) throw new UnrecoverableError(TOPIC_EMBEDDING_EXPIRED_ERROR);
      if (staged.embeddingConfig.embeddingModel !== models.embedding.model)
        throw new TopicsProviderUnavailable(
          "The project's embedding model changed after this batch was created. Start a new Topics execution.",
          "configuration",
        );
      dimensions = staged.embeddingConfig.embeddingDimensions;
      if (staged.summary.state === "complete")
        metrics.result("embedding", "cached");
      rows.push({ ref, summary: staged.summary });
    }
    const unembedded = rows.filter(
      ({ summary }) => summary.state === "summarized",
    );
    if (!unembedded.length) return;
    // One batched call; a retry re-embeds the whole remainder.
    const result = await metrics.measure("embedding", async () => {
      try {
        return await embedTopicSummaries(
          models.embedding,
          unembedded.map(({ summary }) => summary.summary),
          dimensions,
        );
      } catch (error) {
        throw error instanceof TopicsProviderUnavailable
          ? error
          : topicProviderError(error, models.embedding);
      }
    });
    const processedAt = new Date().toISOString();
    for (const [index, row] of unembedded.entries()) {
      const { ref, summary } = row;
      const embedded: TopicSummary = {
        ...summary,
        state: "complete",
        embedding: result.embeddings[index],
        // The batched call's usage is recorded once, on its first summary.
        ...(index === 0 ? mergeTopicModelUsage(summary, result) : {}),
        processedAt,
      };
      metrics.result("embedding", "generated");
      // All overlapping attempts must persist the same accepted result.
      const accepted = await updateStagedTopicSummary(batch, ref, embedded);
      if (!accepted)
        throw new UnrecoverableError(TOPIC_EMBEDDING_EXPIRED_ERROR);
      row.summary = accepted;
    }
  } catch (error) {
    if (isRejectedConnection(error))
      await pauseForRejectedConnection(batch.projectId, error);
    if (
      error instanceof TopicsProviderUnavailable &&
      [
        "authentication",
        "configuration",
        "invalid_input",
        "invalid_output",
      ].includes(error.reason)
    )
      throw new UnrecoverableError(error.message);
    throw error;
  } finally {
    const pending = rows
      .map(({ summary }) => summary)
      .filter((summary) => summary.state !== "summarized");
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
