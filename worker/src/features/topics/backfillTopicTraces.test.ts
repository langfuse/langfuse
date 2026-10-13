import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import {
  QueueJobs,
  TraceBatchQueue,
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { LLMAdapter } from "@langfuse/shared";
import {
  ensureDefaultTopicFacets,
  loadTopicTranscript,
  scheduleTopicBackfill,
  selectTopicTraceRows,
  writeTopicSummaries,
} from "@langfuse/shared/topics/server";

const enabled = vi.hoisted(() => vi.fn(() => true));

vi.mock("@langfuse/shared/topics/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/topics/server")>()),
  isTopicsProjectEnabled: enabled,
}));

import {
  backfillSelectionFilters,
  enqueueTopicTraceBackfill,
} from "./backfillTopicTraces";

const selection = {
  filter: [],
  from: new Date("2026-09-23T00:00:00.000Z"),
  to: new Date("2026-09-24T00:00:00.000Z"),
  limit: 20,
  sampling: "latest" as const,
  seed: "backfill",
};

describe("backfillSelectionFilters", () => {
  it("maps a trace name and tag onto the Topics observation filters", () => {
    expect(
      backfillSelectionFilters({
        traceNames: ["agent-turn"],
        tags: ["billing"],
        extra: [],
      }),
    ).toEqual([
      {
        column: "traceName",
        type: "stringOptions",
        operator: "any of",
        value: ["agent-turn"],
      },
      {
        column: "tags",
        type: "arrayOptions",
        operator: "any of",
        value: ["billing"],
      },
    ]);
  });
});

describe("Topics trace selection and backfill", () => {
  const projectId = randomUUID();
  const addJob = vi.fn();
  beforeAll(async () => {
    await createEventsCh(
      [
        [projectId, "trace-new", "2026-09-23T09:00:00Z"],
        [projectId, "trace-new", "2026-09-23T09:01:00Z"],
        [projectId, "trace-old", "2026-09-23T08:00:00Z"],
        [projectId, "trace-outside", "2026-09-24T00:00:00Z"],
        [randomUUID(), "trace-foreign", "2026-09-23T10:00:00Z"],
        [
          projectId,
          "trace-internal",
          "2026-09-23T11:00:00Z",
          "langfuse-topics",
        ],
        [projectId, "trace-judge", "2026-09-23T12:00:00Z", "llm-as-a-judge"],
        [projectId, "trace-reserved", "2026-09-23T13:00:00Z", "langfuse"],
      ].map(([project, trace, timestamp, environment]) =>
        createEvent({
          project_id: project,
          trace_id: trace,
          start_time: new Date(timestamp),
          trace_name: "agent-turn",
          environment: environment ?? "test",
          tags: ["billing"],
        }),
      ),
    );
  });
  beforeEach(() => {
    enabled.mockReturnValue(true);
    addJob.mockReset();
    vi.spyOn(TraceBatchQueue, "getInstance").mockReturnValue({
      add: addJob,
    } as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it("deduplicates and orders bounded matches without enqueueing a dry run", async () => {
    const result = await enqueueTopicTraceBackfill({
      projectId,
      selection: { ...selection, limit: 1 },
      apply: false,
    });
    expect(result).toEqual({
      matched: 2,
      traceIds: ["trace-new"],
      enqueued: 0,
    });
    expect(addJob).not.toHaveBeenCalled();
  });

  it("enqueues each selected trace with its matching observation time bounds", async () => {
    const result = await enqueueTopicTraceBackfill({
      projectId,
      selection,
      apply: true,
    });
    expect(result.enqueued).toBe(2);
    expect(addJob).toHaveBeenCalledTimes(2);
    const [name, data, options] = addJob.mock.calls[0];
    expect(name).toBe(QueueJobs.TraceBatch);
    expect(data.payload.traces).toEqual([
      expect.objectContaining({
        projectId,
        traceId: "trace-new",
        minStart: Date.parse("2026-09-23T09:00:00.000Z"),
        maxStart: Date.parse("2026-09-23T09:01:00.000Z"),
      }),
    ]);
    expect(options.jobId).toMatch(/^[a-f0-9]{64}$/);
  });

  it("filters latest matching root environments before counting and limiting", async () => {
    const mixedProject = randomUUID();
    const source = {
      project_id: mixedProject,
      trace_name: "agent-turn",
      input: JSON.stringify({ role: "user", content: "Send an invoice" }),
      output: null,
    };
    await createEventsCh(
      [
        ["public-root", "production", "langfuse-topics"],
        ["equal-timestamp", "production", "langfuse-topics"],
        ["internal-root", "langfuse-topics", "production"],
      ]
        .flatMap(([traceId, rootEnvironment, latestEnvironment], index) => [
          createEvent({
            ...source,
            trace_id: traceId,
            span_id: "a-root",
            start_time: new Date(Date.UTC(2026, 8, 23, 9 + index)),
            event_ts: new Date("2026-09-24T12:00:00Z"),
            environment: rootEnvironment,
          }),
          createEvent({
            ...source,
            trace_id: traceId,
            span_id: "z-child",
            parent_span_id: "a-root",
            start_time: new Date(Date.UTC(2026, 8, 24, 9 + index)),
            event_ts: new Date(
              traceId === "equal-timestamp"
                ? "2026-09-24T12:00:00Z"
                : "2026-09-24T13:00:00Z",
            ),
            environment: latestEnvironment,
          }),
        ])
        .concat(
          ["production", "langfuse-topics"].map((environment, index) =>
            createEvent({
              ...source,
              trace_id: "updated-root",
              span_id: "a-root",
              start_time: new Date("2026-09-23T12:00:00Z"),
              event_ts: new Date(Date.UTC(2026, 8, 24, 12 + index)),
              environment,
            }),
          ),
        ),
    );
    const input = { ...selection, projectId: mixedProject, limit: 1 };
    const [preview, ids, backfill] = await Promise.all([
      selectTopicTraceRows(input, prisma, "preview"),
      selectTopicTraceRows(input, prisma, "ids"),
      selectTopicTraceRows(input, prisma, "backfill"),
    ]);
    expect(preview).toEqual([
      expect.objectContaining({
        id: "equal-timestamp",
        environment: "production",
      }),
    ]);
    expect(Number(preview[0].matchedTraceCount)).toBe(2);
    expect(ids).toEqual([{ id: "equal-timestamp" }]);
    expect(backfill.map(({ id }) => id)).toEqual(["equal-timestamp"]);
    expect(Number(backfill[0].matchedTraceCount)).toBe(2);
    for (const [traceId, environment] of [
      ["public-root", "langfuse-topics"],
      ["internal-root", "production"],
      ["equal-timestamp", "langfuse-topics"],
      ["updated-root", "langfuse-topics"],
    ]) {
      expect(
        await loadTopicTranscript({ projectId: mixedProject, traceId }),
      ).toMatchObject({ environment });
    }
  });

  it("keeps preview, ID-only triggers and backfill sampling aligned", async () => {
    const input = {
      ...selection,
      projectId,
      sampling: "random" as const,
      limit: 1,
      filter: backfillSelectionFilters({
        traceNames: ["agent-turn"],
        tags: ["billing"],
        extra: [],
      }),
    };
    const [preview, ids, backfill] = await Promise.all([
      selectTopicTraceRows(input, prisma, "preview"),
      selectTopicTraceRows(input, prisma, "ids"),
      selectTopicTraceRows(input, prisma, "backfill"),
    ]);
    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      name: "agent-turn",
      environment: "test",
    });
    expect(Number(preview[0].matchedTraceCount)).toBe(2);
    expect(ids).toEqual([{ id: preview[0].id }]);
    expect(backfill.map(({ id }) => id)).toEqual(ids.map(({ id }) => id));
  });
});

describe("scheduleTopicBackfill", () => {
  const minute = 60_000;
  const now = Date.now();
  const addJob = vi.fn();
  let projectId: string;

  const event = (
    traceId: string,
    startAgoMinutes: number,
    updatedAgoMinutes: number,
    parentSpanId?: string,
  ) =>
    createEvent({
      project_id: projectId,
      trace_id: traceId,
      span_id: `${traceId}-${startAgoMinutes}`,
      parent_span_id: parentSpanId ?? null,
      start_time: new Date(now - startAgoMinutes * minute),
      updated_at: new Date(now - updatedAgoMinutes * minute),
    });

  beforeAll(async () => {
    ({ projectId } = await createOrgProjectAndApiKey());
    const connection = await prisma.llmApiKeys.create({
      data: {
        projectId,
        provider: `openai-${randomUUID()}`,
        adapter: LLMAdapter.OpenAI,
        secretKey: "encrypted",
        displaySecretKey: "...key",
      },
    });
    await prisma.topicConfig.create({
      data: {
        projectId,
        enabled: true,
        summaryLlmApiKeyId: connection.id,
        summaryModel: "gpt-6-luna",
        embeddingLlmApiKeyId: connection.id,
        embeddingModel: "text-embedding-3-small",
        embeddingDimensions: 1024,
        clusteringLlmApiKeyId: connection.id,
        clusteringModel: "gpt-5.6-terra",
      },
    });
    await prisma.tracingReadinessSettings.create({
      data: { projectId, traceIdleMs: 10 * minute },
    });
    const facets = await ensureDefaultTopicFacets(projectId);

    await createEventsCh([
      // A child starts after the root, so the read window must cover it.
      event("ready", 60, 40),
      event("ready", 50, 40, "ready-60"),
      event("summarized", 55, 45),
      event("partly-summarized", 58, 45),
      // Still inside the idle time, by start and by last write.
      event("recent", 5, 5),
      // Old start, but a write arrived within the idle time.
      event("active", 120, 2),
      event("outside-window", 8 * 24 * 60, 8 * 24 * 60),
    ]);
    const summary = (traceId: string, facet: (typeof facets)[number]) => ({
      projectId,
      traceId,
      sessionId: null,
      facetId: facet.id,
      facetVersion: facet.versions[0].version,
      triggerType: "manual_poc" as const,
      environment: "default",
      traceName: "agent-turn",
      unitStartTime: new Date(now - 55 * minute).toISOString(),
      state: "complete" as const,
      summary: "summary",
      embedding: [0.1],
      transcriptId: "transcript",
      transcriptVersion: "v1",
      summaryModel: "gpt-6-luna",
      embeddingModel: "text-embedding-3-small",
      providedUsageDetails: {},
      usageDetails: {},
      providedCostDetails: {},
      costDetails: {},
      processedAt: new Date(now - 30 * minute).toISOString(),
      metadata: {},
    });
    await writeTopicSummaries([
      ...facets.map((facet) => summary("summarized", facet)),
      summary("partly-summarized", facets[0]),
    ]);
  });
  beforeEach(() => {
    addJob.mockReset();
    vi.spyOn(TraceBatchQueue, "getInstance").mockReturnValue({
      add: addJob,
    } as never);
  });
  afterEach(() => vi.restoreAllMocks());

  const scheduledTraces = () => {
    expect(addJob).toHaveBeenCalledTimes(1);
    const [name, data, options] = addJob.mock.calls[0];
    expect(name).toBe(QueueJobs.TraceBatchBackfill);
    expect(options.jobId).toBe(data.id);
    return data.payload.traces as {
      traceId: string;
      minStart: number;
      maxStart: number;
    }[];
  };

  it("schedules the newest idle traces that miss a current facet summary, with whole-trace bounds", async () => {
    await expect(
      scheduleTopicBackfill({ projectId, source: "ready", limit: 10 }),
    ).resolves.toEqual({ traceCount: 2 });
    expect(scheduledTraces()).toEqual([
      expect.objectContaining({
        projectId,
        traceId: "ready",
        minStart: now - 60 * minute,
        maxStart: now - 50 * minute,
        revision: expect.any(String),
      }),
      expect.objectContaining({ traceId: "partly-summarized" }),
    ]);
  });

  it("caps ready traces at the requested count", async () => {
    await scheduleTopicBackfill({ projectId, source: "ready", limit: 1 });
    expect(scheduledTraces().map(({ traceId }) => traceId)).toEqual(["ready"]);
  });

  it("samples random traces from the window regardless of readiness or summaries", async () => {
    await expect(
      scheduleTopicBackfill({ projectId, source: "random", limit: 10 }),
    ).resolves.toEqual({ traceCount: 5 });
    const traces = scheduledTraces();
    expect(new Set(traces.map(({ traceId }) => traceId))).toEqual(
      new Set(["ready", "summarized", "partly-summarized", "recent", "active"]),
    );
    expect(traces.find(({ traceId }) => traceId === "ready")).toMatchObject({
      minStart: now - 60 * minute,
      maxStart: now - 50 * minute,
    });
  });

  it("refuses a project without automatic processing", async () => {
    const { projectId: disabled } = await createOrgProjectAndApiKey();
    await expect(
      scheduleTopicBackfill({ projectId: disabled, source: "ready", limit: 5 }),
    ).rejects.toThrow("Turn on automatic processing");
    expect(addJob).not.toHaveBeenCalled();
  });
});
