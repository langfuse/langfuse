import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryClickhouse, config } = vi.hoisted(() => ({
  queryClickhouse: vi.fn(),
  config: { LANGFUSE_MIGRATION_V4_WRITE_MODE: "events_only" },
}));

vi.mock("../../../env", () => ({ env: config }));
vi.mock("../../../db", () => ({ prisma: {} }));
vi.mock("../../../server", () => ({}));
vi.mock("../../../server/clickhouse/client", () => ({
  convertDateToClickhouseDateTime: (date: Date) =>
    date.toISOString().replace("T", " ").replace("Z", ""),
}));
vi.mock("../../../server/repositories/clickhouse", () => ({ queryClickhouse }));

import { generationsWithoutModelPricingRule } from "./generationsWithoutModelPricing";

describe("generationsWithoutModelPricingRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-30T12:00:00Z"));
    queryClickhouse.mockResolvedValue([]);
  });

  afterEach(() => vi.restoreAllMocks());

  it.each(["legacy", "events_only"])(
    "finds recent generations without matched models in %s storage",
    async (mode) => {
      config.LANGFUSE_MIGRATION_V4_WRITE_MODE = mode;
      queryClickhouse.mockResolvedValue([
        {
          model_name: "unpriced-a",
          trace_id: "trace-1",
          observation_id: "gen-1",
          start_time: "2026-09-29 12:00:00.000",
        },
        {
          model_name: "unpriced-a",
          trace_id: "trace-2",
          observation_id: "gen-2",
          start_time: "2026-09-28 12:00:00.000",
        },
        {
          model_name: "unpriced-b",
          trace_id: "trace-3",
          observation_id: "gen-3",
          start_time: "2026-09-27 12:00:00.000",
        },
      ]);

      const issues =
        await generationsWithoutModelPricingRule.callback!("project-a");

      expect(issues).toHaveLength(2);
      expect(issues[0].description).toContain("unpriced-a");
      expect(issues[0].description).toContain("observation=gen-1");
      expect(issues[0].description).toContain("observation=gen-2");
      expect(issues[0].ctaLink).toContain("observation=gen-1");
      expect(issues[1].description).toContain("unpriced-b");
      const request = queryClickhouse.mock.calls[0][0];
      expect(request.params).toMatchObject({
        projectId: "project-a",
        since: "2026-08-31 12:00:00.000",
        until: "2026-09-30 12:00:00.000",
      });
      expect(request.query).toContain("project_id = {projectId: String}");
      expect(request.query).toContain("GENERATION");
      expect(request.query).toContain("usage_details");
      expect(request.query).toContain("mapContains");
      expect(request.query).toContain("'total'");
      expect(request.query).toContain(
        mode === "events_only"
          ? "e.model_id = ''"
          : "internal_model_id IS NULL",
      );
      expect(request.query).toContain(
        mode === "events_only"
          ? "LIMIT {limitByCount: Int32} BY"
          : "LIMIT 3 BY",
      );
      expect(request.query).toContain(
        mode === "events_only" ? "events_core" : "observations",
      );
    },
  );

  it("returns no issue without matching generations", async () => {
    expect(
      await generationsWithoutModelPricingRule.callback!("project-a"),
    ).toEqual([]);
  });
});
