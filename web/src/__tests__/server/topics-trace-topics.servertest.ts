import { randomUUID } from "node:crypto";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  createTopicFacet,
  createTopicRun,
  saveTopicRule,
  saveTopicRun,
  writeTopicAssignments,
} from "@langfuse/shared/topics/server";
import { tracesTopics } from "@/src/features/topics/server/traceTopics";

describe("tracesTopics", () => {
  it("names each placement by its own rule's current map and attributes it to that map", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const facet = await createTopicFacet({
      projectId,
      name: `Facet ${randomUUID()}`,
      description: "Facet",
      prompt: "Summarize the trace.",
    });
    const [ruleA, ruleB] = [
      await saveTopicRule({
        projectId,
        name: "A",
        filter: [],
        facetIds: [facet.id],
      }),
      await saveTopicRule({
        projectId,
        name: "B",
        filter: [],
        facetIds: [facet.id],
      }),
    ];
    // Both rules' maps continued the same snapshot, so they share the stable topic id.
    const sharedTopicId = randomUUID();
    const now = new Date().toISOString();
    const publish = async (ruleId: string, name: string) => {
      const run = await createTopicRun({
        projectId,
        facetId: facet.id,
        facetVersion: 1,
        ruleId,
        config: {},
      });
      const topicVersionId = randomUUID();
      await saveTopicRun({
        ...run,
        status: "completed",
        finishedAt: now,
        topics: [
          {
            topicVersionId,
            topicId: sharedTopicId,
            projectId,
            createdByRunId: run.id,
            createdAt: now,
            labels: [],
            name,
            description: name,
            centroid: [1, 0],
            radius: 0.5,
            representativeSummaries: [],
            metadata: {},
          },
        ],
      });
      return { runId: run.id, topicVersionId };
    };
    const earlierA = await publish(ruleA.id, "Billing, earlier name");
    const currentA = await publish(ruleA.id, "Billing");
    const currentB = await publish(ruleB.id, "Refunds");
    const traceId = randomUUID();
    const placement = (
      ruleId: string,
      run: { runId: string; topicVersionId: string },
    ) => ({
      projectId,
      facetId: facet.id,
      facetVersion: 1,
      traceId,
      sessionId: null,
      environment: "production",
      traceName: "assistant",
      unitStartTime: now,
      summaryProcessedAt: now,
      runId: run.runId,
      ruleId,
      topicId: sharedTopicId,
      topicVersionId: run.topicVersionId,
      distance: 0.1,
      runnerUpDistance: 0.2,
      origin: "online" as const,
      coordinates: null,
      createdAt: now,
    });
    // Rule A placed the trace in its earlier run only; rule B in its current run.
    await writeTopicAssignments([
      placement(ruleA.id, earlierA),
      placement(ruleB.id, currentB),
    ]);

    const topics = await tracesTopics(projectId, [
      { traceId, timestamp: new Date(now) },
    ]);

    expect(
      [...(topics[traceId] ?? [])].sort((a, b) =>
        (a.topic ?? "").localeCompare(b.topic ?? ""),
      ),
    ).toEqual([
      { facet: facet.name, topic: "Billing", runIds: [currentA.runId] },
      { facet: facet.name, topic: "Refunds", runIds: [currentB.runId] },
    ]);
  });
});
