import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createEvent,
  createEventsCh,
  getTopicSetupTraceBounds,
  getTopicSetupTraceIds,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  getNewestTopicClusteringSummaries,
  loadTopicTranscript,
  selectTopicTraceRows,
  summarizedTopicMatchesQuery,
  writeTopicSummaries,
} from "@langfuse/shared/topics/server";

const selection = {
  filter: [],
  from: new Date("2026-09-23T00:00:00.000Z"),
  to: new Date("2026-09-24T00:00:00.000Z"),
  limit: 20,
  sampling: "latest" as const,
  seed: "selection",
};

describe("Topics trace selection", () => {
  const projectId = randomUUID();
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
          parent_span_id: "missing-parent",
          is_app_root: false,
          name: "fetch_context",
          start_time: new Date(timestamp),
          trace_name: "agent-turn",
          environment: environment ?? "test",
          tags: ["billing"],
        }),
      ),
    );
  });
  it("deduplicates, orders and scopes matches to the project, window and public environments", async () => {
    const input = { ...selection, projectId };
    const [preview, ids] = await Promise.all([
      selectTopicTraceRows(input, prisma, "preview"),
      selectTopicTraceRows(input, prisma, "ids"),
    ]);
    expect(ids).toEqual([{ id: "trace-new" }, { id: "trace-old" }]);
    expect(Number(preview[0].matchedTraceCount)).toBe(2);
  });

  it("selects traces without a root through a child span's name", async () => {
    const input = {
      ...selection,
      projectId,
      limit: 1,
      filter: [
        {
          column: "traceName",
          type: "stringOptions" as const,
          operator: "any of" as const,
          value: ["agent-turn"],
        },
        {
          column: "name",
          type: "stringOptions" as const,
          operator: "any of" as const,
          value: ["fetch_context"],
        },
      ],
    };
    const [preview, ids] = await Promise.all([
      selectTopicTraceRows(input, prisma, "preview"),
      selectTopicTraceRows(input, prisma, "ids"),
    ]);
    expect(ids).toEqual([{ id: "trace-new" }]);
    expect(Number(preview[0].matchedTraceCount)).toBe(2);
  });

  it("loads the newest summaries of traces that meet a rule's filter, filtering before the limit", async () => {
    await createEventsCh(
      [
        ["trace-unmatched", "2026-09-23T09:30:00Z", "plan"],
        ["trace-earlier", "2026-09-12T09:00:00Z", "fetch_context"],
        // Starts before the 7-day step and matches 30 minutes later, inside it.
        ["trace-long", "2026-09-16T23:50:00Z", "plan"],
        ["trace-long", "2026-09-17T00:20:00Z", "fetch_context"],
      ].map(([trace, timestamp, name]) =>
        createEvent({
          project_id: projectId,
          trace_id: trace,
          name,
          start_time: new Date(timestamp),
          environment: "test",
        }),
      ),
    );
    // "trace-outside" matches the filter but has no summary.
    await writeTopicSummaries(
      [
        ["trace-new", "2026-09-23T09:00:00.000Z"],
        ["trace-old", "2026-09-23T08:00:00.000Z"],
        ["trace-unmatched", "2026-09-23T09:30:00.000Z"],
        ["trace-earlier", "2026-09-12T09:00:00.000Z"],
        ["trace-long", "2026-09-16T23:50:00.000Z"],
      ].map(([traceId, unitStartTime]) => ({
        projectId,
        facetId: "facet",
        facetVersion: 1,
        traceId,
        sessionId: null,
        triggerType: "manual_poc",
        environment: "test",
        traceName: "agent-turn",
        unitStartTime,
        state: "complete",
        summary: "summary",
        embedding: [1, 0],
        transcriptId: "transcript",
        transcriptVersion: "v1",
        summaryModel: "summary",
        embeddingModel: "embed",
        providedUsageDetails: {},
        usageDetails: {},
        providedCostDetails: {},
        costDetails: {},
        processedAt: new Date().toISOString(),
        metadata: {},
      })),
    );
    const facet = { facetId: "facet", version: 1 };
    const timeRange = {
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: selection.to,
    };

    const newest = (limits: { maxRows: number; maxBytes: number }) =>
      getNewestTopicClusteringSummaries(
        projectId,
        facet,
        { embeddingModel: "embed", embeddingDimensions: 2 },
        timeRange,
        limits,
        (slice) =>
          summarizedTopicMatchesQuery(
            {
              projectId,
              facet,
              filter: [
                {
                  column: "name",
                  type: "stringOptions",
                  operator: "any of",
                  value: ["fetch_context"],
                },
              ],
              ...slice,
            },
            prisma,
          ),
      ).then((rows) => rows.map(({ traceId }) => traceId));

    // The newest summary does not match; the oldest match is past the limit.
    await expect(newest({ maxRows: 3, maxBytes: 1_000_000 })).resolves.toEqual([
      "trace-new",
      "trace-old",
      "trace-long",
    ]);
    // A step that fills its byte-estimated limit ends the read, so no older slice follows.
    await expect(newest({ maxRows: 3, maxBytes: 6000 })).resolves.toEqual([
      "trace-new",
      "trace-old",
    ]);
  });

  it("filters latest matching environments before counting and limiting", async () => {
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
    const [preview, ids] = await Promise.all([
      selectTopicTraceRows(input, prisma, "preview"),
      selectTopicTraceRows(input, prisma, "ids"),
    ]);
    expect(preview).toEqual([
      expect.objectContaining({
        id: "equal-timestamp",
        environment: "production",
      }),
    ]);
    expect(Number(preview[0].matchedTraceCount)).toBe(2);
    expect(ids).toEqual([{ id: "equal-timestamp" }]);
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

  it("keeps preview and ID-only trigger sampling aligned", async () => {
    const input = {
      ...selection,
      projectId,
      sampling: "random" as const,
      limit: 1,
      filter: [
        {
          column: "traceName",
          type: "stringOptions" as const,
          operator: "any of" as const,
          value: ["agent-turn"],
        },
        {
          column: "tags",
          type: "arrayOptions" as const,
          operator: "any of" as const,
          value: ["billing"],
        },
      ],
    };
    const [preview, ids] = await Promise.all([
      selectTopicTraceRows(input, prisma, "preview"),
      selectTopicTraceRows(input, prisma, "ids"),
    ]);
    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      name: "agent-turn",
      environment: "test",
    });
    expect(Number(preview[0].matchedTraceCount)).toBe(2);
    expect(ids).toEqual([{ id: preview[0].id }]);
  });
});

describe("Topics setup backfill selection", () => {
  const DAY_MS = 86_400_000;
  const summary = (
    projectId: string,
    traceId: string,
    facetId: string,
    unitStartTime: Date,
    state: "complete" | "not_applicable",
    embeddingModel = "embed",
  ) => ({
    projectId,
    facetId,
    facetVersion: 1,
    traceId,
    sessionId: null,
    triggerType: "manual_poc" as const,
    environment: "test",
    traceName: "agent-turn",
    unitStartTime: unitStartTime.toISOString(),
    state,
    summary: state === "complete" ? "summary" : null,
    embedding: state === "complete" ? [1, 0] : [],
    transcriptId: "transcript",
    transcriptVersion: "v1",
    summaryModel: "summary",
    embeddingModel,
    providedUsageDetails: {},
    usageDetails: {},
    providedCostDetails: {},
    costDetails: {},
    processedAt: new Date().toISOString(),
    metadata: {},
  });
  const select = (
    projectId: string,
    now: Date,
    input: { limit: number; seed?: string },
  ) =>
    getTopicSetupTraceIds({
      projectId,
      idleMs: 60_000,
      now,
      days: 7,
      sampling: 1,
      seed: "rule",
      summarized: {
        facets: [
          { facetId: "intent", version: 1 },
          { facetId: "outcome", version: 1 },
        ],
        embeddingConfig: { embeddingModel: "embed", embeddingDimensions: 2 },
      },
      ...input,
    });

  it("selects every unsummarized finished trace, and a repeatable sample beyond the limit", async () => {
    const projectId = randomUUID();
    const now = new Date();
    const start = new Date(now.getTime() - 2 * 60 * 60_000);
    const fresh = Array.from({ length: 6 }, (_, index) => `fresh-${index}`);
    await createEventsCh(
      [
        ...["summarized", "one-facet", "other-embedding", ...fresh].map(
          (traceId) => [traceId, start, start],
        ),
        // Still active within the idle wait, and older than the window.
        ["active", start, new Date(now.getTime() - 10_000)],
        ["old", new Date(now.getTime() - 8 * DAY_MS), start],
      ].map(([traceId, startTime, eventTs]) =>
        createEvent({
          project_id: projectId,
          trace_id: traceId as string,
          start_time: startTime as Date,
          event_ts: eventTs as Date,
          environment: "test",
        }),
      ),
    );
    await writeTopicSummaries([
      summary(projectId, "summarized", "intent", start, "complete"),
      summary(projectId, "summarized", "outcome", start, "not_applicable"),
      summary(projectId, "one-facet", "intent", start, "complete"),
      summary(projectId, "other-embedding", "intent", start, "complete", "old"),
      summary(projectId, "other-embedding", "outcome", start, "complete"),
    ]);

    // Below the limit, every match: a missing facet or embedding counts as unsummarized.
    expect((await select(projectId, now, { limit: 500 })).toSorted()).toEqual(
      ["one-facet", "other-embedding", ...fresh].toSorted(),
    );
    // Beyond it, a sample of the limit's size that the same seed repeats.
    const sample = await select(projectId, now, { limit: 3 });
    expect(sample).toHaveLength(3);
    expect(await select(projectId, now, { limit: 3 })).toEqual(sample);
  });

  it("reads each selected trace's whole extent and bytes for trace dispatch", async () => {
    const projectId = randomUUID();
    const now = new Date();
    const windowStart = new Date(now.getTime() - 7 * DAY_MS);
    // The first span predates the window by a day; the trace still counts as one.
    const starts = [
      new Date(windowStart.getTime() - DAY_MS),
      new Date(now.getTime() - 2 * 60 * 60_000),
    ];
    await createEventsCh(
      starts.map((startTime) =>
        createEvent({
          project_id: projectId,
          trace_id: "long",
          start_time: startTime,
          event_ts: startTime,
          environment: "test",
        }),
      ),
    );

    const [bounds] = await getTopicSetupTraceBounds({
      projectId,
      traceIds: ["long", "missing"],
      from: windowStart,
    });

    expect(bounds).toMatchObject({
      traceId: "long",
      minStart: starts[0].getTime(),
      maxStart: starts[1].getTime(),
    });
    expect(bounds.serializedEventBytes).toBeGreaterThan(0);
  });
});
