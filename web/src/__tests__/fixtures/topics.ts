import { randomUUID } from "node:crypto";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  createTopicFacet,
  createTopicRun,
  saveTopicRule,
  saveTopicRun,
  writeTopicAssignments,
  writeTopicSummaries,
} from "@langfuse/shared/topics/server";

/**
 * A Topics-enabled project with one rule and facet whose published run holds
 * one topic, and one trace summarized and assigned to it.
 */
export async function topicsProject() {
  const project = await createOrgProjectAndApiKey();
  const facet = await createTopicFacet({
    projectId: project.projectId,
    name: `Facet ${randomUUID()}`,
    description: "Private facet",
    prompt: "Summarize the trace.",
  });
  const run = await createTopicRun({
    projectId: project.projectId,
    facetId: facet.id,
    facetVersion: 1,
    config: {},
  });
  const rule = await saveTopicRule({
    projectId: project.projectId,
    filter: [],
    facetIds: [facet.id],
  });
  const topicId = randomUUID();
  const topicVersionId = randomUUID();
  const traceId = randomUUID();
  const now = new Date().toISOString();
  await saveTopicRun({
    ...run,
    status: "completed",
    finishedAt: now,
    topics: [
      {
        topicVersionId,
        topicId,
        projectId: project.projectId,
        createdByRunId: run.id,
        createdAt: now,
        tags: [],
        name: "Private topic",
        description: "Private topic description",
        centroid: [1, 0],
        radius: 0.5,
        representativeSummaries: [],
        metadata: {},
      },
    ],
  });
  const summary = {
    projectId: project.projectId,
    facetId: facet.id,
    facetVersion: 1,
    traceId,
    sessionId: null,
    environment: "production",
    traceName: "assistant",
    unitStartTime: now,
  };
  await writeTopicSummaries([
    {
      ...summary,
      triggerType: "manual_poc",
      state: "complete",
      summary: "Private summary",
      embedding: [1, 0],
      transcriptId: "test",
      transcriptVersion: "test",
      summaryModel: "summary-model",
      embeddingModel: "embedding-model",
      providedUsageDetails: {},
      usageDetails: {},
      providedCostDetails: {},
      costDetails: {},
      processedAt: now,
      metadata: {},
    },
  ]);
  await writeTopicAssignments([
    {
      ...summary,
      summaryProcessedAt: now,
      runId: run.id,
      topicId,
      topicVersionId,
      distance: 0.1,
      runnerUpDistance: 0.2,
      origin: "initial",
      coordinates: null,
      assignedAt: now,
    },
  ]);
  return { ...project, facetId: facet.id, ruleId: rule.id, topicId, traceId };
}
