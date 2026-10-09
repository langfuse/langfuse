import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  TopicAssignment,
  TopicDefinition,
  TopicSummary,
  TopicExecutionInput,
} from "@langfuse/shared/topics";
import {
  getTopicDefinitions,
  writeTopicDefinitions,
  writeTopicSummaries,
  writeTopicAssignments,
  listTopicSummaries,
  getLatestFacetSummaries,
  getTopicClusteringSummaries,
  getTopicSummaryCounts,
  createTopicFacet,
  createTopicFacetVersion,
  ensureDefaultTopicFacets,
  getTopicFacetVersion,
  listTopicFacets,
  getTopicRule,
  listTopicRules,
  saveTopicRule,
  saveTopicRuleAndModels,
  createTopicExecution,
  readTopicExecutionSummary,
  writeTopicExecution,
  createTopicRun,
  getTopicRun,
  saveTopicRun,
} from "@langfuse/shared/topics/server";
import { clickhouseClient } from "@langfuse/shared/src/server/clickhouse";
import { prisma } from "@langfuse/shared/src/db";

describe("Topics eval-backed configuration", () => {
  const orgId = randomUUID();
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  const ruleProjectId = randomUUID();
  const rollbackProjectId = randomUUID();

  beforeAll(async () => {
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "Topics storage test",
        projects: {
          create: [
            { id: projectId, name: "Topics" },
            { id: otherProjectId, name: "Other project" },
            { id: ruleProjectId, name: "Topics rule" },
            { id: rollbackProjectId, name: "Topics rollback" },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  it("initializes built-in FACET evaluators once under concurrent requests", async () => {
    await createTopicFacet({
      projectId,
      name: "Intent",
      description: "Custom facet",
      prompt: "Summarize a custom aspect of the request.",
    });
    const results = await Promise.all(
      Array.from({ length: 3 }, () => ensureDefaultTopicFacets(projectId)),
    );
    const defaults = await prisma.evaluator.findMany({
      where: { projectId, type: "FACET", isBuiltIn: true },
      include: { versions: true },
    });
    expect(defaults).toHaveLength(4);
    for (const result of results)
      expect(
        result
          .filter((facet) => facet.isBuiltIn)
          .map((facet) => facet.id)
          .sort(),
      ).toEqual(defaults.map((facet) => facet.id).sort());
    const facet = defaults[0]!;
    expect(facet.versions).toHaveLength(1);
    await expect(
      createTopicFacetVersion({
        projectId,
        facetId: facet.id,
        prompt: "Replace the built-in instructions.",
      }),
    ).rejects.toThrow(/built-in/i);
  });

  it("keeps one Topics rule per project when first saves race", async () => {
    const facets = await ensureDefaultTopicFacets(ruleProjectId);
    const facetIds = facets.slice(0, 2).map((facet) => facet.id);
    const saved = await Promise.all(
      [0.25, 0.5, 0.75].map((sampling) =>
        saveTopicRule({
          projectId: ruleProjectId,
          filter: [],
          facetIds,
          sampling,
        }),
      ),
    );

    // Every save succeeds and writes the same rule; none creates a second one.
    expect(new Set(saved.map((rule) => rule.id)).size).toBe(1);
    const rules = await listTopicRules(ruleProjectId);
    expect(rules).toHaveLength(1);
    expect(rules[0].facetIds.sort()).toEqual([...facetIds].sort());
  });

  it("leaves no rule behind when the model settings cannot be written", async () => {
    const facets = await ensureDefaultTopicFacets(rollbackProjectId);
    await expect(
      saveTopicRuleAndModels(
        {
          projectId: rollbackProjectId,
          filter: [],
          facetIds: [facets[0].id],
        },
        {
          enabled: true,
          blockedAt: null,
          blockReason: null,
          blockMessage: null,
          // No such connection: the foreign key rejects the model write.
          summaryLlmApiKeyId: "missing-connection",
          summaryModel: "gpt-6-luna",
          embeddingLlmApiKeyId: null,
          embeddingModel: null,
          embeddingDimensions: 1024,
          clusteringLlmApiKeyId: null,
          clusteringModel: null,
        },
      ),
    ).rejects.toThrow();

    expect(await listTopicRules(rollbackProjectId)).toEqual([]);
    expect(
      await prisma.topicConfig.findUnique({
        where: { projectId: rollbackProjectId },
      }),
    ).toBeNull();
  });

  it("keeps versions and rule assignments scoped to this project's FACET evaluators", async () => {
    const facet = await createTopicFacet({
      projectId,
      name: "Intent",
      description: "Custom facet with a built-in name",
      prompt: "Describe the original request.",
    });
    const next = {
      projectId,
      facetId: facet.id,
      prompt: " Describe the result. ",
    };
    const versions = await Promise.all([
      createTopicFacetVersion(next),
      createTopicFacetVersion(next),
    ]);
    expect(versions.map((version) => version.version)).toEqual([2, 2]);
    expect(await getTopicFacetVersion(projectId, facet.id, 1)).toMatchObject({
      prompt: "Describe the original request.",
    });
    const foreign = await createTopicFacet({
      projectId: otherProjectId,
      name: "Foreign facet",
      description: "",
      prompt: "Describe another project's request.",
    });
    const evaluator = await prisma.evaluator.create({
      data: {
        projectId,
        name: "Ordinary evaluator",
        type: "LLM_AS_JUDGE",
        versions: { create: { version: 1, prompt: "Grade the answer." } },
      },
    });
    for (const id of [foreign.id, evaluator.id]) {
      expect(await getTopicFacetVersion(projectId, id, 1)).toBeNull();
      await expect(
        createTopicFacetVersion({ ...next, facetId: id }),
      ).rejects.toThrow(/project/);
      await expect(
        saveTopicRule({
          projectId,
          name: "Invalid",
          filter: [],
          facetIds: [id],
        }),
      ).rejects.toThrow(/project/);
    }
    const visible = await listTopicFacets(projectId);
    expect(visible.find((value) => value.id === facet.id)).toMatchObject({
      isBuiltIn: false,
    });
    expect(visible.map((value) => value.id)).not.toContain(evaluator.id);
    const rule = await saveTopicRule({
      projectId,
      name: "Saved selection",
      filter: [],
      facetIds: [facet.id, facet.id],
    });
    expect(rule.facetIds).toEqual([facet.id]);
    // A save without an id writes the project's single rule.
    expect(
      await saveTopicRule({
        projectId,
        name: "Second selection",
        filter: [],
        facetIds: [facet.id],
      }),
    ).toMatchObject({ id: rule.id, name: "Second selection" });
    expect(
      await prisma.evaluationRule.findUnique({ where: { id: rule.id } }),
    ).toMatchObject({
      targetObject: "trace",
      delay: 0,
      idleTime: null,
      timeScope: ["NEW"],
      status: "ACTIVE",
    });
    const ordinaryRule = await prisma.evaluationRule.create({
      data: {
        projectId,
        name: "Evaluation rule",
        filter: [],
        sampling: 1,
        delay: 0,
        targetObject: "trace",
        assignments: { create: { projectId, evaluatorId: evaluator.id } },
      },
    });
    expect(await getTopicRule(otherProjectId, rule.id)).toBeNull();
    expect(await getTopicRule(projectId, ordinaryRule.id)).toBeNull();
    expect(
      (await listTopicRules(projectId)).map((value) => value.id),
    ).not.toContain(ordinaryRule.id);
    await expect(
      saveTopicRule({ ...rule, id: ordinaryRule.id }),
    ).rejects.toThrow(/not found/);
  });

  it("rejects foreign run versions and atomically creates one journal and run on replay", async () => {
    const facet = await createTopicFacet({
      projectId,
      name: "Publication",
      description: "",
      prompt: "Describe publication behavior.",
    });
    const input: TopicExecutionInput = {
      projectId,
      requestId: randomUUID(),
      operation: "update",
      facets: [{ facetId: facet.id, version: 1 }],
      timeRange: { from: new Date("2026-09-01"), to: new Date("2026-10-01") },
      embeddingConfig: {
        embeddingModel: "eu.cohere.embed-v4:0",
        embeddingDimensions: 256,
      },
      exploratory: false,
    };
    await expect(
      createTopicRun({
        projectId: otherProjectId,
        facetId: facet.id,
        facetVersion: 1,
        config: {},
      }),
    ).rejects.toThrow(/project/);
    await expect(
      createTopicExecution(
        { ...input, projectId: otherProjectId },
        undefined,
        "test-user",
      ),
    ).rejects.toThrow(/project/);
    expect(
      await prisma.batchAction.count({ where: { projectId: otherProjectId } }),
    ).toBe(0);
    const [first, replay] = await Promise.all([
      createTopicExecution(input, undefined, "test-user"),
      createTopicExecution(input, undefined, "test-user"),
    ]);
    expect(replay.id).toBe(first.id);
    expect(replay.facets[0]?.runId).toBe(first.facets[0]?.runId);
    const progress = (await readTopicExecutionSummary(projectId, first.id))!;
    await writeTopicExecution({
      ...progress,
      status: "running",
      phase: "clustering",
    });
    expect(await readTopicExecutionSummary(projectId, first.id)).toMatchObject({
      input,
      status: "running",
      phase: "clustering",
    });
    expect(
      await prisma.topicClusteringRun.count({
        where: { projectId, facetId: facet.id },
      }),
    ).toBe(1);
    const run = (await getTopicRun(projectId, first.facets[0]!.runId!))!;
    const completed = await saveTopicRun({
      ...run,
      status: "completed",
      finishedAt: new Date().toISOString(),
    });
    expect(
      await saveTopicRun({ ...run, status: "failed", error: "Late retry" }),
    ).toEqual(completed);
  });
});

describe("Topics definition persistence", () => {
  const projectId = randomUUID();
  const otherProjectId = randomUUID();

  afterAll(async () => {
    for (const table of [
      "topics",
      "topic_facet_summaries",
      "topic_assignments",
    ])
      await clickhouseClient().command({
        query: `DELETE FROM ${table} WHERE project_id IN {projectIds:Array(String)}`,
        query_params: { projectIds: [projectId, otherProjectId] },
        clickhouse_settings: { mutations_sync: "1" },
      });
  });

  it("partitions by source time while preserving replacement and published map identities", async () => {
    const summary: TopicSummary = {
      projectId,
      facetId: "facet",
      facetVersion: 1,
      traceId: randomUUID(),
      sessionId: null,
      triggerType: "manual_poc",
      environment: "default",
      traceName: "trace",
      unitStartTime: "2026-08-31T23:59:59.999Z",
      state: "complete",
      summary: "old",
      embedding: [1, ...Array<number>(255).fill(0)],
      transcriptId: "poc",
      transcriptVersion: "poc",
      summaryModel: "test",
      embeddingModel: "eu.cohere.embed-v4:0",
      providedUsageDetails: {},
      usageDetails: {},
      providedCostDetails: {},
      costDetails: {},
      processedAt: "2026-09-01T00:00:00.000Z",
      metadata: {},
    };
    const latest = {
      ...summary,
      summary: "latest",
      sessionId: "parent-session",
      processedAt: "2026-10-01T00:00:00.000Z",
    };
    await writeTopicSummaries([summary, latest]);
    const assignment: TopicAssignment = {
      projectId,
      facetId: summary.facetId,
      facetVersion: 1,
      traceId: summary.traceId,
      sessionId: null,
      environment: "default",
      traceName: "trace",
      unitStartTime: summary.unitStartTime,
      summaryProcessedAt: summary.processedAt,
      runId: "published",
      topicId: null,
      topicVersionId: null,
      distance: null,
      runnerUpDistance: null,
      origin: "initial",
      coordinates: [1, 2],
      assignedAt: "2026-09-01T00:00:00.000Z",
    };
    await writeTopicAssignments([
      assignment,
      {
        ...assignment,
        sessionId: "parent-session",
        assignedAt: "2026-10-01T00:00:00.000Z",
      },
      {
        ...assignment,
        origin: "online",
        coordinates: null,
        assignedAt: "2026-10-02T00:00:00.000Z",
      },
      {
        ...assignment,
        runId: "unpublished",
        assignedAt: "2026-10-03T00:00:00.000Z",
      },
    ]);
    const summaries = await clickhouseClient().query({
      query: `SELECT _partition_id AS partition, summary, session_id FROM topic_facet_summaries FINAL
        WHERE project_id = {projectId:String} AND unit_start_time >= '2026-08-01' AND unit_start_time < '2026-09-01'`,
      query_params: { projectId },
      format: "JSONEachRow",
    });
    expect(await summaries.json()).toEqual([
      { partition: "202608", summary: "latest", session_id: "parent-session" },
    ]);
    const assignments = await clickhouseClient().query({
      query: `SELECT _partition_id AS partition, clustering_run_id AS run, origin, coordinates FROM topic_assignments FINAL
        WHERE project_id = {projectId:String} AND unit_start_time >= '2026-08-01' AND unit_start_time < '2026-09-01'
        ORDER BY run, origin`,
      query_params: { projectId },
      format: "JSONEachRow",
    });
    expect(await assignments.json()).toEqual([
      {
        partition: "202608",
        run: "published",
        origin: "initial",
        coordinates: [1, 2],
      },
      {
        partition: "202608",
        run: "published",
        origin: "online",
        coordinates: [],
      },
      {
        partition: "202608",
        run: "unpublished",
        origin: "initial",
        coordinates: [1, 2],
      },
    ]);
    const filter = {
      facetId: summary.facetId,
      facetVersion: 1,
      traceIds: [summary.traceId!],
    };
    expect(
      (
        await listTopicSummaries(projectId, filter, {
          from: new Date(summary.unitStartTime),
          to: new Date(Date.parse(summary.unitStartTime) + 1),
        })
      ).map(({ summary }) => summary),
    ).toEqual(["latest"]);
    expect(
      await listTopicSummaries(projectId, filter, {
        from: new Date("2026-08-01T00:00:00.000Z"),
        to: new Date(summary.unitStartTime),
      }),
    ).toEqual([]);

    const oldRange = {
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-09-01T00:00:00.000Z"),
    };
    const newRange = {
      from: oldRange.to,
      to: new Date("2026-10-01T00:00:00.000Z"),
    };
    await writeTopicSummaries([
      {
        ...latest,
        projectId: otherProjectId,
        processedAt: "2026-10-04T00:00:00.000Z",
      },
      { ...latest, facetId: "other-facet", facetVersion: 2 },
    ]);
    for (const version of [1, undefined])
      expect(
        await getLatestFacetSummaries(projectId, "facet", version, oldRange),
      ).toEqual([latest]);

    const moved: TopicSummary = {
      ...summary,
      unitStartTime: "2026-09-01T00:00:00.000Z",
      processedAt: "2026-10-02T00:00:00.000Z",
      state: "not_applicable",
      summary: "",
      embedding: [],
    };
    await writeTopicSummaries([moved, summary]);
    const embedding = {
      embeddingModel: "eu.cohere.embed-v4:0" as const,
      embeddingDimensions: 256 as const,
    };
    expect(
      await Promise.all([
        listTopicSummaries(projectId, filter, oldRange),
        getLatestFacetSummaries(projectId, "facet", undefined, oldRange),
        getTopicClusteringSummaries(projectId, "facet", 1, embedding, oldRange),
        getTopicSummaryCounts(
          projectId,
          [{ facetId: "facet", version: 1 }],
          embedding,
          oldRange,
        ),
      ]),
    ).toEqual([[], [], [], [{ facetId: "facet", facetVersion: 1, count: 0 }]]);

    const newerVersion = {
      ...summary,
      facetVersion: 2,
      processedAt: "2026-09-30T00:00:00.000Z",
    };
    await writeTopicSummaries([newerVersion]);
    expect(
      await getLatestFacetSummaries(projectId, "facet", undefined, oldRange),
    ).toEqual([newerVersion]);
    expect(
      await getLatestFacetSummaries(projectId, "facet", undefined, newRange),
    ).toEqual([]);
    expect(
      await getLatestFacetSummaries(projectId, "facet", 1, newRange),
    ).toEqual([moved]);
  });

  it("round-trips Float64 geometry and normalized source references through ClickHouse", async () => {
    const topic: TopicDefinition = {
      projectId,
      topicVersionId: randomUUID(),
      topicId: randomUUID(),
      createdByRunId: randomUUID(),
      createdAt: "2026-09-24T21:21:07.329Z",
      name: "Rechnungen — 請求書 💶",
      description: "Résumé and invoice requests. ".repeat(10),
      // This value loses a Float64 bit in ClickHouse's JSON number parser.
      centroid: Array.from({ length: 1024 }, (_, i) =>
        i === 847 ? -0.003662027125082599 : Math.sin(i) / 32,
      ),
      radius: 0.003662027125082599,
      tags: ["billing", "請求書"],
      representativeSummaries: [
        {
          facetId: "facet-a",
          facetVersion: 257,
          traceId: "source/請求書",
          sessionId: null,
        },
        {
          facetId: "facet-a",
          facetVersion: 257,
          traceId: null,
          sessionId: "source/請求書",
        },
      ],
      metadata: { effectiveMemberCount: 15, lineage: [], source: "請求書" },
    };
    const other: TopicDefinition = {
      ...topic,
      topicVersionId: randomUUID(),
      topicId: randomUUID(),
      createdAt: "2026-09-24T21:21:07.330Z",
      centroid: [1, 0, -1],
      radius: 0,
      tags: [],
      representativeSummaries: [],
      metadata: {},
    };

    await writeTopicDefinitions([
      {
        ...topic,
        representativeSummaries: topic.representativeSummaries.map(
          (source) => ({
            ...source,
            sessionId: source.traceId ? "parent-session" : source.sessionId,
          }),
        ),
      },
      other,
    ]);
    const ids = [topic.topicVersionId, other.topicVersionId];
    const timeRange = {
      from: new Date(topic.createdAt),
      to: new Date(Date.parse(other.createdAt) + 1),
    };
    expect(await getTopicDefinitions(projectId, ids, timeRange)).toEqual([
      other,
      topic,
    ]);
    expect(await getTopicDefinitions(randomUUID(), ids, timeRange)).toEqual([]);
    expect(
      await getTopicDefinitions(projectId, ids, {
        from: timeRange.to,
        to: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).toEqual([]);
  });
});
