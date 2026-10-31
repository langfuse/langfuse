import { describe, expect, it, vi } from "vitest";
import {
  getTopicProcessingMapIds,
  getTopicRun,
} from "@langfuse/shared/topics/server";
import { getServingTopicRun } from "./servingRuns";

vi.mock("@langfuse/shared/topics/server", () => ({
  getTopicProcessingMapIds: vi.fn(),
  getTopicRun: vi.fn(),
}));

const config = { embeddingModel: "embed", embeddingDimensions: 2 };

describe("getServingTopicRun", () => {
  it("caches the serving map ID and completed runs, but reads other runs again", async () => {
    vi.mocked(getTopicProcessingMapIds).mockResolvedValue([
      { runId: "pending" },
    ] as never);
    vi.mocked(getTopicRun).mockResolvedValue({ status: "running" } as never);
    const facet = { facetId: "facet", version: 1 };
    await expect(getServingTopicRun("p", facet, config)).resolves.toBeNull();
    await expect(getServingTopicRun("p", facet, config)).resolves.toBeNull();
    expect(getTopicProcessingMapIds).toHaveBeenCalledOnce();
    expect(getTopicRun).toHaveBeenCalledTimes(2);

    vi.mocked(getTopicProcessingMapIds).mockResolvedValue([
      { runId: "done" },
    ] as never);
    vi.mocked(getTopicRun).mockResolvedValue({ status: "completed" } as never);
    const other = { facetId: "facet", version: 2 };
    const [first, second] = await Promise.all([
      getServingTopicRun("p", other, config),
      getServingTopicRun("p", other, config),
    ]);
    expect(first).toEqual({ status: "completed" });
    expect(second).toBe(first);
    expect(getTopicRun).toHaveBeenCalledTimes(3);
  });
});
