import { UnrecoverableError } from "bullmq";
import type { TopicSummary } from "@langfuse/shared/topics";
import {
  deleteStagedTopicSummary,
  readStagedTopicSummary,
  readTopicSummaries,
  TOPIC_EMBEDDING_EXPIRED_ERROR,
  updateStagedTopicSummary,
  writeTopicSummaries,
  type TopicEmbeddingBatch,
  type TopicEmbeddingRef,
} from "@langfuse/shared/topics/server";
import { embedTopicSummary } from "./models";
import { TopicMetrics } from "./metrics";
import {
  topicProviderError,
  TopicsProviderUnavailable,
} from "./provider-error";

function validateSummary(
  batch: TopicEmbeddingBatch,
  ref: TopicEmbeddingRef,
  summary: TopicSummary,
  staged: boolean,
): void {
  if (
    summary.projectId !== batch.projectId ||
    summary.id !== ref.summaryId ||
    summary.facetVersionId !== ref.facetVersionId ||
    summary.traceId !== ref.traceId ||
    (staged && summary.executionId !== batch.executionId)
  )
    throw new UnrecoverableError("Topics embedding summary identity mismatch.");
}

/** Acknowledging a batch means every result is durably stored in ClickHouse. */
export async function processTopicEmbeddingBatch(
  batch: TopicEmbeddingBatch,
): Promise<void> {
  const metrics = new TopicMetrics();
  const stored = new Map(
    (
      await metrics.measure(
        "storage",
        () =>
          readTopicSummaries(
            batch.projectId,
            batch.summaries.map((ref) => ref.summaryId),
          ),
        "storage",
      )
    ).map((summary) => [summary.id, summary]),
  );
  const pending: TopicSummary[] = [];
  const acknowledged: TopicEmbeddingRef[] = [];
  try {
    for (const ref of batch.summaries) {
      const durable = stored.get(ref.summaryId);
      if (durable) {
        validateSummary(batch, ref, durable, false);
        acknowledged.push(ref);
        continue;
      }
      const staged = await readStagedTopicSummary(batch, ref);
      if (!staged) throw new UnrecoverableError(TOPIC_EMBEDDING_EXPIRED_ERROR);
      let { summary } = staged;
      validateSummary(batch, ref, summary, true);
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
          resultVersion: 2,
          embedding: result.embedding,
          embeddingTokens: result.inputTokens,
          embeddingCostUsd: result.costUsd,
          processedAt: new Date().toISOString(),
        };
        metrics.embeddingResult(summary.id, "generated");
        pending.push(summary);
        acknowledged.push(ref);
        // Keep paid work reusable after a failed ClickHouse write. Expiry does
        // not discard the in-memory result or extend the original Redis TTL.
        await updateStagedTopicSummary(batch, ref, summary);
      } else {
        if (summary.state === "complete")
          metrics.embeddingResult(summary.id, "cached");
        pending.push(summary);
        acknowledged.push(ref);
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
    // Even a partially successful batch is persisted before its queue retry.
    await Promise.all(
      acknowledged.map((ref) => deleteStagedTopicSummary(batch, ref)),
    );
  }
}
