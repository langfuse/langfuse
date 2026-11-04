import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTopicExecution,
  enqueueTopicExecution,
  getEnabledTopicsModels,
  getTopicClusteringSummaryStats,
  readTopicExecutionForRequest,
} from "@langfuse/shared/topics/server";
import type { TopicsModels } from "@langfuse/shared/topics/server";
import { nightlyRefitSlot, scheduleNightlyTopicRefits } from "./nightlyRefit";

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    topicClusteringRun: {
      findFirst: vi.fn(async ({ where }: { where: { status?: unknown } }) =>
        where.status
          ? null
          : {
              config: {
                timeRange: {
                  from: "2026-11-02T00:00:00.000Z",
                  to: "2026-11-03T00:00:00.000Z",
                },
              },
            },
      ),
    },
  },
}));

const skipped = vi.hoisted(() => new Set<string>());
vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  redis: {
    exists: vi.fn(async (key: string) => Number(skipped.has(key))),
    set: vi.fn(async (key: string) => skipped.add(key) && "OK"),
  },
}));

vi.mock("@langfuse/shared/topics/server", () => ({
  TOPICS_SYSTEM_USER_ID: "system:topics",
  createTopicExecution: vi.fn(async () => ({
    id: "execution",
    status: "queued",
  })),
  enqueueTopicExecution: vi.fn(),
  getEnabledTopicsModels: vi.fn(),
  getTopicClusteringSummaryStats: vi.fn(async () => ({ count: 10, bytes: 1 })),
  getTopicProcessingMapIds: vi.fn(
    async (
      _projectId: string,
      facets: { facetId: string; version: number }[],
    ) =>
      facets.map(({ facetId, version }) => ({
        facetId,
        facetVersion: version,
        runId: `${facetId}-run`,
      })),
  ),
  listTopicFacets: vi.fn(async () => [
    { id: "facet", versions: [{ version: 2 }, { version: 1 }] },
  ]),
  listTopicRules: vi.fn(async () => [{ facetIds: ["facet"] }]),
  readTopicExecutionForRequest: vi.fn(async () => null),
}));

vi.mock("./topicsAutomation", () => ({
  selectDiscoveryWindow: vi.fn(async () => ({
    from: new Date("2026-11-01T00:00:00.000Z"),
    to: new Date("2026-11-04T05:00:00.000Z"),
  })),
}));

const settings = { hourUtc: 4, spreadMinutes: 60 };
const now = new Date("2026-11-04T06:00:00.000Z");

function enableProjects(...projectIds: string[]) {
  vi.mocked(getEnabledTopicsModels).mockResolvedValue(
    new Map(
      projectIds.map((projectId) => [
        projectId,
        { projectId, embedding: { model: "embed", dimensions: 2 } },
      ]),
    ) as unknown as Map<string, TopicsModels>,
  );
}

describe("nightlyRefitSlot", () => {
  it("spreads projects within the window after the configured hour", () => {
    const slots = Array.from({ length: 50 }, (_, index) =>
      nightlyRefitSlot(`project-${index}`, now, settings),
    );
    for (const slot of slots) {
      expect(slot.getTime()).toBeGreaterThanOrEqual(
        Date.parse("2026-11-04T04:00:00.000Z"),
      );
      expect(slot.getTime()).toBeLessThan(
        Date.parse("2026-11-04T05:00:00.000Z"),
      );
    }
    expect(new Set(slots.map(Number)).size).toBeGreaterThan(10);
    expect(nightlyRefitSlot("project-0", now, settings)).toEqual(slots[0]);
  });

  it("returns the previous day's slot before today's has passed", () => {
    const slot = nightlyRefitSlot(
      "project",
      new Date("2026-11-04T03:00:00.000Z"),
      settings,
    );
    expect(slot.toISOString().startsWith("2026-11-03T04:")).toBe(true);
  });
});

describe("scheduleNightlyTopicRefits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    skipped.clear();
    enableProjects("project");
  });

  it("starts one update per published map with a slot-derived request ID", async () => {
    await expect(scheduleNightlyTopicRefits(now)).resolves.toBe(1);
    expect(createTopicExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project",
        operation: "update",
        facets: [{ facetId: "facet", version: 2 }],
        requestId: expect.stringMatching(/^nightly-refit-/),
      }),
      expect.any(String),
      "system:topics",
    );
    expect(enqueueTopicExecution).toHaveBeenCalledWith("project", "execution");

    const [[input, requestHash]] = vi.mocked(createTopicExecution).mock.calls;
    vi.mocked(readTopicExecutionForRequest).mockImplementationOnce(
      async (_projectId, requestId, hash) =>
        requestId === input.requestId && hash === requestHash
          ? ({ id: "execution", status: "running" } as Awaited<
              ReturnType<typeof readTopicExecutionForRequest>
            >)
          : null,
    );
    await expect(
      scheduleNightlyTopicRefits(new Date(now.getTime() + 300_000)),
    ).resolves.toBe(0);
    expect(createTopicExecution).toHaveBeenCalledTimes(1);
  });

  it("skips the slot when no summaries arrived after the published map", async () => {
    vi.mocked(getTopicClusteringSummaryStats).mockResolvedValueOnce({
      count: 0,
      bytes: 0,
    });
    await scheduleNightlyTopicRefits(now);
    await scheduleNightlyTopicRefits(new Date(now.getTime() + 300_000));
    expect(createTopicExecution).not.toHaveBeenCalled();
    expect(getTopicClusteringSummaryStats).toHaveBeenCalledTimes(1);
  });

  it("caps the refits started in one tick", async () => {
    enableProjects(...Array.from({ length: 8 }, (_, index) => `p-${index}`));
    await expect(scheduleNightlyTopicRefits(now)).resolves.toBe(5);
  });
});
