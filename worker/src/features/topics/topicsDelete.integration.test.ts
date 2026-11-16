import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { TopicSummary } from "@langfuse/shared/topics";
import {
  deleteTopicRows,
  writeTopicAssignments,
  writeTopicDefinitions,
  writeTopicSummaries,
} from "@langfuse/shared/topics/server";
import { queryClickhouse } from "@langfuse/shared/src/server";

describe("deleteTopicRows", () => {
  const projectId = randomUUID();
  const otherProjectId = randomUUID();

  const write = async (project: string, runId: string) => {
    const summary: TopicSummary = {
      projectId: project,
      facetId: "facet",
      facetVersion: 1,
      traceId: `trace-${runId}`,
      sessionId: null,
      triggerType: "manual_poc",
      environment: "production",
      traceName: "checkout",
      unitStartTime: "2026-10-01T12:00:00.000Z",
      state: "complete",
      summary: "Refund request",
      embedding: [1, ...Array<number>(255).fill(0)],
      transcriptId: "t",
      transcriptVersion: "v",
      summaryModel: "test",
      embeddingModel: "test",
      providedUsageDetails: {},
      usageDetails: {},
      providedCostDetails: {},
      costDetails: {},
      processedAt: "2026-10-01T13:00:00.000Z",
      metadata: {},
    };
    await writeTopicSummaries([summary]);
    await writeTopicAssignments([
      {
        projectId: project,
        facetId: summary.facetId,
        facetVersion: 1,
        traceId: summary.traceId,
        sessionId: null,
        environment: summary.environment,
        traceName: summary.traceName,
        unitStartTime: summary.unitStartTime,
        summaryProcessedAt: summary.processedAt,
        runId,
        topicId: `topic-${runId}`,
        topicVersionId: `topic-${runId}-v1`,
        distance: 0.1,
        runnerUpDistance: 0.2,
        origin: "initial",
        coordinates: null,
        assignedAt: "2026-10-02T00:00:00.000Z",
      },
    ]);
    await writeTopicDefinitions([
      {
        projectId: project,
        topicId: `topic-${runId}`,
        topicVersionId: `topic-${runId}-v1`,
        createdByRunId: runId,
        createdAt: "2026-10-02T00:00:00.000Z",
        tags: [],
        name: "Refunds",
        description: "",
        centroid: [1, 0],
        radius: 0.5,
        representativeSummaries: [],
        metadata: {},
      },
    ]);
  };

  const rows = async (project: string) => {
    const counts = await queryClickhouse<{ table: string; runs: string[] }>({
      query: `
        SELECT 'summaries' AS table, groupArray(trace_id) AS runs FROM topic_facet_summaries WHERE project_id = {project: String}
        UNION ALL SELECT 'assignments', groupArray(clustering_run_id) FROM topic_assignments WHERE project_id = {project: String}
        UNION ALL SELECT 'topics', groupArray(created_by_run_id) FROM topics WHERE project_id = {project: String}`,
      params: { project },
    });
    return Object.fromEntries(
      counts.map(({ table, runs }) => [table, [...runs].sort()]),
    );
  };

  it("deletes one rule's maps, then the whole project, and nothing else", async () => {
    await write(projectId, "run-a");
    await write(projectId, "run-b");
    await write(otherProjectId, "run-a");

    await deleteTopicRows({ projectId, runIds: ["run-a"] });
    expect(await rows(projectId)).toEqual({
      summaries: ["trace-run-a", "trace-run-b"],
      assignments: ["run-b"],
      topics: ["run-b"],
    });

    await deleteTopicRows({ projectId });
    expect(await rows(projectId)).toEqual({
      summaries: [],
      assignments: [],
      topics: [],
    });
    expect(await rows(otherProjectId)).toEqual({
      summaries: ["trace-run-a"],
      assignments: ["run-a"],
      topics: ["run-a"],
    });
  });
});
