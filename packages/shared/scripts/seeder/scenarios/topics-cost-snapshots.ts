import { prisma } from "../../../src/db";
import {
  createTopicExecution,
  recordTopicNamingCost,
  getTopicExecutionNamingCosts,
  getTopicExecutionCosts,
  writeTopicSummaries,
  saveTopicRun,
  TOPICS_ACTION,
  writeTopicAssignments,
  writeTopicExecution,
} from "../../../src/server/topics";
import type {
  TopicAssignment,
  TopicRun,
  TopicSummary,
} from "../../../src/topics";
import { SeedError, type ScenarioContext } from "./types";

/** Snapshots reuse the seeded Intent map so their costs and map contents can be inspected together. */
export async function seedTopicCostSnapshots(
  ctx: ScenarioContext,
  sourceRun: TopicRun,
  assignments: TopicAssignment[],
  summaries: TopicSummary[],
  timeRange: { from: string; to: string },
  geometry: { embeddingModel: string; dimensions: number },
) {
  const { projectId } = ctx;
  const snapshots: { id: string; runId: string }[] = [];
  for (const partial of [false, true]) {
    const requestId = `${ctx.idPrefix}-snapshot-${partial ? "partial" : "priced"}`;
    // A new day has new cohort bounds. Rebuild only this fixture's immutable execution and facet runs.
    const existing = await prisma.batchAction.findFirst({
      where: {
        projectId,
        actionType: TOPICS_ACTION,
        config: { path: ["inputSettings", "requestId"], equals: requestId },
      },
      select: { id: true },
    });
    if (existing) {
      await prisma.$transaction([
        prisma.topicClusteringRun.deleteMany({
          where: { projectId, batchActionId: existing.id },
        }),
        prisma.batchAction.delete({ where: { projectId, id: existing.id } }),
      ]);
    }
    const execution = await createTopicExecution(
      {
        operation: "update",
        projectId,
        requestId,
        facets: [
          { facetId: sourceRun.facetId, version: sourceRun.facetVersion },
        ],
        timeRange: {
          from: new Date(timeRange.from),
          to: new Date(timeRange.to),
        },
        embeddingConfig: {
          embeddingModel: geometry.embeddingModel,
          embeddingDimensions: geometry.dimensions,
        },
        exploratory: false,
        analysis: {
          label: partial
            ? "Seed: partially priced snapshot"
            : "Seed: checkout snapshot",
          seed: ctx.idPrefix,
          filter: [
            {
              column: "tags",
              type: "arrayOptions",
              operator: "any of",
              value: ["topics-map"],
            },
          ],
          summarize: { limit: 2, selection: "latest" },
        },
      },
      undefined,
      "topics-map-seeder",
    );
    const progress = execution.facets[0]!;
    const runId = progress.runId!;
    await recordTopicNamingCost(projectId, runId, "seed-name", 0.08);
    await saveTopicRun({
      ...sourceRun,
      id: runId,
      ruleId: null,
      batchActionId: execution.id,
      config: {
        ...geometry,
        timeRange,
        analysis: true,
      },
    });
    await writeTopicAssignments(
      assignments.map((row) => ({ ...row, ruleId: null, runId })),
    );
    const pricedRows = partial ? summaries.slice(2, 4) : summaries.slice(0, 2);
    const processingCosts = [0.2, partial ? null : 0.22];
    await writeTopicSummaries(
      pricedRows.map((row, index): TopicSummary => {
        const cost = processingCosts[index];
        return {
          ...row,
          triggerType: "snapshot",
          executionId: execution.id,
          costDetails: cost == null ? {} : { summary_input: cost, total: cost },
        };
      }),
    );
    const assigned = assignments.filter((row) => row.topicId !== null).length;
    await writeTopicExecution({
      ...execution,
      status: "completed",
      phase: "completed",
      facets: [
        {
          ...progress,
          outcome: "published",
          counts: {
            ...progress.counts,
            requested: assignments.length,
            complete: assignments.length,
            assigned,
            outlier: assignments.length - assigned,
          },
        },
      ],
    });
    const [processing, naming] = await Promise.all([
      getTopicExecutionCosts(projectId, [execution.id]),
      getTopicExecutionNamingCosts(projectId, [execution.id]),
    ]);
    if (
      processing[execution.id] !== (partial ? 0.2 : 0.42) ||
      naming[execution.id] !== 0.08
    ) {
      throw new SeedError(`Incorrect recorded model cost for ${requestId}.`);
    }
    snapshots.push({ id: execution.id, runId });
  }
  return snapshots;
}
