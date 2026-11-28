import { afterEach, expect, it, vi } from "vitest";
import { convertDateToClickhouseDateTime } from "../clickhouse/client.js";
import { TRACE_START_SLACK_MS } from "./clickhouse.js";
import { topicFilterConditions } from "./trace-filter.js";

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

afterEach(() => {
  vi.clearAllMocks();
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

it("matches stable topic IDs directly (including after rename or with duplicate names) and falls back to names for legacy filters", async () => {
  postgres.listTopicFacets.mockResolvedValue([
    { id: "facet-1", name: "Intent" },
  ]);
  postgres.getPublishedTopicMaps.mockResolvedValue({
    runIds: ["run-1"],
    maps: [
      {
        facetId: "facet-1",
        topics: [
          { topicId: "topic-a", name: "Support" },
          { topicId: "topic-b", name: "Support" },
          { topicId: "topic-c", name: "Renamed Billing" },
        ],
      },
    ],
  });
  const window = [
    {
      type: "datetime" as const,
      column: "startTime",
      operator: ">=" as const,
      value: new Date("2026-05-25T00:00:00.000Z"),
    },
    {
      type: "datetime" as const,
      column: "startTime",
      operator: "<" as const,
      value: new Date("2026-06-01T00:00:00.000Z"),
    },
  ];

  // Stable ID targets only topic-a even though topic-b shares the same name.
  const [byId] = await topicFilterConditions("project-b", [
    { ...topicFilter, value: ["topic-a"] },
    ...window,
  ]);
  expect(byId?.params.topicFilter0_topicIds).toEqual(["topic-a"]);

  // Stable ID keeps matching after a topic rename.
  const [afterRename] = await topicFilterConditions("project-b", [
    { ...topicFilter, value: ["topic-c"] },
    ...window,
  ]);
  expect(afterRename?.params.topicFilter0_topicIds).toEqual(["topic-c"]);

  // Legacy name-based URLs still resolve to matching topic IDs.
  const [legacyName] = await topicFilterConditions("project-b", [
    { ...topicFilter, value: ["Support"] },
    ...window,
  ]);
  expect(legacyName?.params.topicFilter0_topicIds).toEqual([
    "topic-a",
    "topic-b",
  ]);
});
