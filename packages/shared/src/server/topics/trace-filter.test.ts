import { afterEach, beforeEach, expect, it, vi } from "vitest";

const postgres = vi.hoisted(() => ({
  listTopicFacets: vi.fn(),
  getPublishedTopicMaps: vi.fn(),
}));
vi.mock("./postgres", () => postgres);

const topicFilter = {
  type: "categoryOptions" as const,
  column: "topics",
  key: "Intent",
  operator: "any of" as const,
  value: ["Order Exchange Requests"],
};

beforeEach(() => {
  vi.stubEnv("LANGFUSE_TOPICS_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", "EU");
  vi.stubEnv("LANGFUSE_TOPICS_ENABLED_PROJECT_IDS", "project-b");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

it("rejects topic filters outside the project allowlist before reading anything", async () => {
  const { topicFilterConditions } = await import("./trace-filter.js");
  await expect(
    topicFilterConditions("project-a", [topicFilter]),
  ).rejects.toThrow("Topic filters are not available.");
  await expect(topicFilterConditions("project-a", [])).resolves.toEqual([]);
  expect(postgres.listTopicFacets).not.toHaveBeenCalled();
  expect(postgres.getPublishedTopicMaps).not.toHaveBeenCalled();
});

it("follows the table window up to 93 days and rejects longer or open windows", async () => {
  postgres.listTopicFacets.mockResolvedValue([
    { id: "facet-1", name: "Intent" },
  ]);
  postgres.getPublishedTopicMaps.mockResolvedValue({
    runIds: ["run-1"],
    maps: [
      {
        facetId: "facet-1",
        topics: [{ topicId: "topic-1", name: "Order Exchange Requests" }],
      },
    ],
  });
  const { topicFilterConditions } = await import("./trace-filter.js");
  const { TRACE_START_SLACK_MS } = await import("./clickhouse.js");
  const { convertDateToClickhouseDateTime } =
    await import("../clickhouse/client.js");
  const to = new Date("2026-06-01T00:00:00.000Z");
  const bound = (operator: ">=" | "<", value: Date) => ({
    type: "datetime" as const,
    column: "startTime",
    operator,
    value,
  });
  const daysBefore = (days: number) =>
    new Date(to.getTime() - days * 86_400_000);

  const [last90] = await topicFilterConditions("project-b", [
    topicFilter,
    bound(">=", daysBefore(90)),
    bound("<", to),
  ]);
  expect(last90?.params.topicFilter0_from).toBe(
    convertDateToClickhouseDateTime(
      new Date(daysBefore(90).getTime() - TRACE_START_SLACK_MS),
    ),
  );

  // An older bar bound beside the picker's bound does not widen the window.
  const [tightest] = await topicFilterConditions("project-b", [
    topicFilter,
    bound(">=", daysBefore(400)),
    bound(">=", daysBefore(7)),
    bound("<", to),
  ]);
  expect(tightest?.params.topicFilter0_from).toBe(
    convertDateToClickhouseDateTime(
      new Date(daysBefore(7).getTime() - TRACE_START_SLACK_MS),
    ),
  );

  for (const window of [
    [bound("<", to)],
    [bound(">=", daysBefore(94)), bound("<", to)],
  ])
    await expect(
      topicFilterConditions("project-b", [topicFilter, ...window]),
    ).rejects.toThrow("Topic filters cover at most 93 days.");
});

it("matches nothing without querying when the table's date filters cannot overlap", async () => {
  const { topicFilterConditions } = await import("./trace-filter.js");
  const bounds = [
    {
      type: "datetime" as const,
      column: "startTime",
      operator: ">=" as const,
      value: new Date("2026-06-01"),
    },
    {
      type: "datetime" as const,
      column: "startTime",
      operator: "<" as const,
      value: new Date("2026-05-01"),
    },
  ];

  await expect(
    topicFilterConditions("project-b", [topicFilter, ...bounds]),
  ).resolves.toEqual([{ query: "0 = 1", params: {} }]);
  await expect(
    topicFilterConditions("project-b", [
      { ...topicFilter, operator: "none of" as const },
      ...bounds,
    ]),
  ).resolves.toEqual([]);
  expect(postgres.listTopicFacets).not.toHaveBeenCalled();
});
