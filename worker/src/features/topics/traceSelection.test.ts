import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createEvent, createEventsCh } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  loadTopicTranscript,
  selectTopicTraceRows,
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
