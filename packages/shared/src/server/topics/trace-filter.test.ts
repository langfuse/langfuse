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

it("bounds the assignment lookup to the Topics maximum range when the table window is open or longer", async () => {
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
  const { TOPICS_MAX_TIME_RANGE_MS } = await import("../../topics/index.js");
  const { convertDateToClickhouseDateTime } =
    await import("../clickhouse/client.js");
  const to = new Date("2026-06-01T00:00:00.000Z");
  const expectedFrom = convertDateToClickhouseDateTime(
    new Date(to.getTime() + 1 - TOPICS_MAX_TIME_RANGE_MS),
  );
  const upper = {
    type: "datetime" as const,
    column: "startTime",
    operator: "<" as const,
    value: to,
  };

  const [open] = await topicFilterConditions("project-b", [topicFilter, upper]);
  expect(open?.params.topicFilter0_from).toBe(expectedFrom);

  const [long] = await topicFilterConditions("project-b", [
    topicFilter,
    upper,
    { ...upper, operator: ">=" as const, value: new Date("2025-01-01") },
  ]);
  expect(long?.params.topicFilter0_from).toBe(expectedFrom);
});
