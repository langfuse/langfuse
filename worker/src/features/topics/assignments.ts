import type {
  TopicAssignment,
  TopicEmbeddingConfig,
  TopicFacetRef,
  TopicRun,
  TopicSummary,
} from "@langfuse/shared/topics";
import { classifyTopic } from "./classifier";

export function topicAssignments(input: {
  projectId: string;
  facet: TopicFacetRef;
  embeddingConfig: TopicEmbeddingConfig;
  summaries: TopicSummary[];
  run: TopicRun;
  origin: TopicAssignment["origin"];
  assignedAt: string;
  coordinates?: Map<string, [number, number]>;
}): TopicAssignment[] {
  const {
    projectId,
    facet,
    embeddingConfig,
    summaries,
    run,
    origin,
    assignedAt,
  } = input;
  if (
    run.projectId !== projectId ||
    run.facetId !== facet.facetId ||
    run.facetVersion !== facet.version ||
    run.config.dimensions !== embeddingConfig.embeddingDimensions ||
    run.topics.some(
      (topic) => topic.centroid.length !== embeddingConfig.embeddingDimensions,
    ) ||
    run.config.embeddingModel !== embeddingConfig.embeddingModel
  )
    throw new Error("Target map is incompatible with this facet version.");
  const prototypes = run.topics.map((topic) => ({
    id: topic.topicVersionId,
    centroid: topic.centroid,
    radius: topic.radius,
  }));
  return summaries.map((summary) => {
    if (
      summary.traceId === null ||
      summary.projectId !== projectId ||
      summary.facetId !== facet.facetId ||
      summary.facetVersion !== facet.version
    )
      throw new Error("Topics assignment source does not match its facet.");
    const assigned = classifyTopic(summary.embedding, prototypes);
    const topic = run.topics.find(
      (candidate) => candidate.topicVersionId === assigned.topicId,
    );
    return {
      coordinates: input.coordinates?.get(summary.traceId) ?? null,
      projectId,
      facetId: facet.facetId,
      facetVersion: facet.version,
      sessionId: summary.sessionId,
      traceId: summary.traceId,
      environment: summary.environment,
      traceName: summary.traceName,
      unitStartTime: summary.unitStartTime,
      summaryProcessedAt: summary.processedAt,
      runId: run.id,
      topicId: topic?.topicId ?? null,
      topicVersionId: topic?.topicVersionId ?? null,
      distance: assigned.distance,
      runnerUpDistance: assigned.runnerUpDistance,
      origin,
      assignedAt,
    };
  });
}
