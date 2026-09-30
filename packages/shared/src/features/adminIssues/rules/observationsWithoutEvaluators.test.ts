import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findEvaluator, queryClickhouse, config } = vi.hoisted(() => ({
  findEvaluator: vi.fn(),
  queryClickhouse: vi.fn(),
  config: { LANGFUSE_MIGRATION_V4_WRITE_MODE: "legacy" },
}));

vi.mock("../../../db", () => ({
  prisma: { evaluator: { findFirst: findEvaluator } },
}));
vi.mock("../../../env", () => ({ env: config }));
vi.mock("../../../server/repositories/clickhouse", () => ({ queryClickhouse }));

// The rule's imports reach the server barrel, which re-exports the registry;
// loading the registry first matches production module order.
import "../adminIssueDefinitions";
import { observationsWithoutEvaluatorsRule } from "./observationsWithoutEvaluators";

describe("observationsWithoutEvaluatorsRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-30T12:00:00Z"));
    findEvaluator.mockResolvedValue(null);
    queryClickhouse.mockResolvedValue([]);
  });

  afterEach(() => vi.restoreAllMocks());

  it.each(["legacy", "events_only"])(
    "suggests evaluator setup for recent observations using %s storage",
    async (mode) => {
      config.LANGFUSE_MIGRATION_V4_WRITE_MODE = mode;
      queryClickhouse.mockResolvedValue([{ found: 1 }]);

      const issues =
        await observationsWithoutEvaluatorsRule.callback!("project-a");

      expect(issues).toEqual([
        {
          description: expect.stringContaining("Set up evaluators"),
          priority: 3,
          ctaLink: "/project/project-a/evals",
        },
      ]);
      expect(findEvaluator).toHaveBeenCalledWith({
        where: { projectId: "project-a" },
        select: { id: true },
      });
      const request = queryClickhouse.mock.calls[0][0];
      expect(request.params).toMatchObject({
        projectId: "project-a",
        since: "2026-08-31 12:00:00.000",
        until: "2026-09-30 12:00:00.000",
      });
      expect(request.query).toContain("project_id = {projectId: String}");
      expect(request.query).toContain("start_time >= {since: DateTime64(3)}");
      expect(request.query).toContain("start_time <= {until: DateTime64(3)}");
      expect(request.query).toContain(
        mode === "events_only" ? "events_core" : "observations",
      );
      expect(request.query).toContain("LIMIT");
      if (mode === "events_only") {
        expect(request.params.limit).toBe(1);
        expect(request.query).toContain("is_deleted = 0");
      } else {
        expect(request.query).toContain("LIMIT 1");
      }
    },
  );

  it("returns no issue when an evaluator exists without querying observations", async () => {
    findEvaluator.mockResolvedValue({ id: "evaluator-a" });

    expect(
      await observationsWithoutEvaluatorsRule.callback!("project-a"),
    ).toEqual([]);
    expect(queryClickhouse).not.toHaveBeenCalled();
  });

  it("returns no issue when there are no observations in the time window", async () => {
    expect(
      await observationsWithoutEvaluatorsRule.callback!("project-a"),
    ).toEqual([]);
    expect(queryClickhouse).toHaveBeenCalledTimes(1);
  });
});
