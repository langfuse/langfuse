import { describe, expect, it, vi } from "vitest";
import {
  getTopicRuleMapRow,
  getTopicRun,
} from "@langfuse/shared/topics/server";
import { getRuleTopicRun } from "./servingRuns";

vi.mock("@langfuse/shared/topics/server", () => ({
  getTopicRuleMapRow: vi.fn(),
  getTopicRun: vi.fn(),
}));

const config = { embeddingModel: "embed", embeddingDimensions: 2 };

describe("getRuleTopicRun", () => {
  it("caches the rule's map ID and completed runs, but reads other runs again", async () => {
    const mapRow = (id: string, facetVersion: number) =>
      ({
        id,
        facetVersion,
        config: { embeddingModel: "embed", dimensions: 2 },
      }) as never;
    vi.mocked(getTopicRuleMapRow).mockResolvedValue(mapRow("pending", 1));
    vi.mocked(getTopicRun).mockResolvedValue({ status: "running" } as never);
    const facet = { facetId: "facet", version: 1 };
    await expect(
      getRuleTopicRun("p", "rule", facet, config),
    ).resolves.toBeNull();
    await expect(
      getRuleTopicRun("p", "rule", facet, config),
    ).resolves.toBeNull();
    expect(getTopicRuleMapRow).toHaveBeenCalledOnce();
    expect(getTopicRun).toHaveBeenCalledTimes(2);

    vi.mocked(getTopicRuleMapRow).mockResolvedValue(mapRow("done", 2));
    vi.mocked(getTopicRun).mockResolvedValue({ status: "completed" } as never);
    const other = { facetId: "facet", version: 2 };
    const [first, second] = await Promise.all([
      getRuleTopicRun("p", "rule", other, config),
      getRuleTopicRun("p", "rule", other, config),
    ]);
    expect(first).toEqual({ status: "completed" });
    expect(second).toBe(first);
    expect(getTopicRun).toHaveBeenCalledTimes(3);

    // A map of an older facet version can't place a newer summary.
    vi.mocked(getTopicRuleMapRow).mockResolvedValue(mapRow("old", 1));
    await expect(
      getRuleTopicRun("p", "other-rule", other, config),
    ).resolves.toBeNull();
    expect(getTopicRun).toHaveBeenCalledTimes(3);
  });
});
