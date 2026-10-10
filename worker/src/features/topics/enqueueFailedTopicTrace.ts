import { createHash } from "node:crypto";
import { prisma } from "@langfuse/shared/src/db";
import {
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import {
  topicEmbeddingConfigSchema,
  topicProcessingConfigSchema,
} from "@langfuse/shared/topics";
import {
  createAutomaticTopicExecution,
  enqueueTopicExecution,
  ensureDefaultTopicFacets,
  getTopicsModelConfig,
  isTopicsProjectEnabled,
} from "@langfuse/shared/topics/server";
import { type TopicProcessingScope } from "./summarizeAssembledTrace";

type Recovery = NonNullable<
  TQueueJobTypes[QueueName.TraceBatch]["topicRecovery"]
>;

/** Retain one failed source in the resumable Topics pipeline, reusing paid results. */
export async function enqueueFailedTopicTrace(
  reference: Recovery,
  retain: (accepted: Recovery) => Promise<void>,
  scope?: TopicProcessingScope,
): Promise<void> {
  const enabled = isTopicsProjectEnabled(reference.projectId);
  if (
    !(await prisma.project.findUnique({
      where: { id: reference.projectId },
      select: { id: true },
    }))
  )
    return;
  if (!enabled)
    throw new Error(
      "Topics is disabled with a pending accepted recovery admission.",
    );
  let input = reference.input;
  if (!input) {
    if (scope && scope.projectId !== reference.projectId)
      throw new Error(
        "Topics recovery scope does not match its source project.",
      );
    const models = scope ? undefined : getTopicsModelConfig();
    const facets =
      scope?.facets ??
      (await ensureDefaultTopicFacets(reference.projectId))
        .flatMap((facet) =>
          facet.projectId === reference.projectId
            ? facet.versions.slice(0, 1).map((version) => ({
                facetId: version.facetId,
                version: version.version,
              }))
            : [],
        )
        .sort((a, b) => a.facetId.localeCompare(b.facetId));
    const processingConfig =
      scope?.processingConfig ??
      topicProcessingConfigSchema.parse({
        summaryModel: models?.summaryModel,
      });
    const embeddingConfig =
      scope?.embeddingConfig ??
      topicEmbeddingConfigSchema.parse({
        embeddingModel: models?.embeddingModel,
      });
    const requestId = createHash("sha256")
      .update(
        JSON.stringify([
          "trace-recovery",
          reference.projectId,
          reference.traceId,
          reference.traceTimestamp,
          facets,
          processingConfig,
          embeddingConfig,
        ]),
      )
      .digest("hex");
    input = {
      projectId: reference.projectId,
      requestId,
      operation: "process",
      traceIds: [reference.traceId],
      facets,
      reuseExistingSummaries: true,
      processingConfig,
      embeddingConfig,
    };
    await retain({ ...reference, input });
  }
  if (
    input.operation !== "process" ||
    input.projectId !== reference.projectId ||
    input.traceIds.length !== 1 ||
    input.traceIds[0] !== reference.traceId
  )
    throw new Error(
      "Topics recovery input does not match its source reference.",
    );
  const execution = await createAutomaticTopicExecution(input);
  await enqueueTopicExecution(reference.projectId, execution.id, [
    reference.traceId,
  ]);
}
