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
