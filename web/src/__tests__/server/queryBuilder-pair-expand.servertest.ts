import {
  QueryBuilder,
  executeQuery,
  env,
  createEvent,
  createEventsCh,
  clickhouseClient,
  randomUUID,
} from "./queryBuilder.fixtures";

describe("queryBuilder", () => {
  describe("pairExpand map expansion (v2)", () => {
    const isEventsTableV2Enabled =
      env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true" ? it : it.skip;
    let hasLegacyEventsTable = false;

    const maybeItWithEventsTable = (
      name: string,
      testFn: () => Promise<void>,
    ): void => {
      isEventsTableV2Enabled(name, async () => {
        if (!hasLegacyEventsTable) return;
        await testFn();
      });
    };

    beforeAll(async () => {
      if (env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN !== "true") return;

      try {
        const result = await clickhouseClient().query({
          query: "EXISTS TABLE default.events",
          format: "TabSeparated",
        });
        hasLegacyEventsTable = (await result.text()).trim() === "1";
      } catch {
        hasLegacyEventsTable = false;
      }
    });

    it("should emit ARRAY JOIN clause for pairExpand dimensions", async () => {
      const projectId = randomUUID();
      const builder = new QueryBuilder(undefined, "v2");
      const { query: sql } = await builder.build(
        {
          view: "observations",
          dimensions: [{ field: "costType" }],
          metrics: [{ measure: "costByType", aggregation: "sum" }],
          filters: [],
          timeDimension: null,
          fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
          toTimestamp: new Date(Date.now() + 86400000).toISOString(),
          orderBy: null,
        },
        projectId,
        true,
      );

      expect(sql).toContain("ARRAY JOIN");
      expect(sql).toContain(
        "mapKeys(events_observations.cost_details) AS costType",
      );
      expect(sql).toContain(
        "mapValues(events_observations.cost_details) AS cost_value",
      );
      // ARRAY JOIN must appear before WHERE
      expect(sql.indexOf("ARRAY JOIN")).toBeLessThan(sql.indexOf("WHERE"));
      // No inline arrayJoin() function call — must use clause form
      expect(sql).not.toMatch(/arrayJoin\(mapKeys/);
    });

    maybeItWithEventsTable(
      "should aggregate cost_details by type correctly",
      async () => {
        const projectId = randomUUID();

        const events = [
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            cost_details: { input: 10, output: 20, total: 30 },
            start_time: Date.now() * 1000,
          }),
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            cost_details: { input: 5, output: 15, total: 20 },
            start_time: Date.now() * 1000,
          }),
        ];
        await createEventsCh(events);

        const result = await executeQuery(
          projectId,
          {
            view: "observations",
            dimensions: [{ field: "costType" }],
            metrics: [{ measure: "costByType", aggregation: "sum" }],
            filters: [],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          "v2",
          true,
        );

        expect(result).toHaveLength(3);

        const inputRow = result.find((r) => r["costType"] === "input");
        expect(Number(inputRow?.["sum_costByType"])).toBeCloseTo(15, 2); // 10 + 5

        const outputRow = result.find((r) => r["costType"] === "output");
        expect(Number(outputRow?.["sum_costByType"])).toBeCloseTo(35, 2); // 20 + 15

        const totalRow = result.find((r) => r["costType"] === "total");
        expect(Number(totalRow?.["sum_costByType"])).toBeCloseTo(50, 2); // 30 + 20
      },
    );

    maybeItWithEventsTable(
      "should aggregate usage_details by type correctly",
      async () => {
        const projectId = randomUUID();

        const events = [
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            usage_details: { input: 100, output: 200, total: 300 },
            start_time: Date.now() * 1000,
          }),
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            usage_details: { input: 50, output: 75, total: 125 },
            start_time: Date.now() * 1000,
          }),
        ];
        await createEventsCh(events);

        const result = await executeQuery(
          projectId,
          {
            view: "observations",
            dimensions: [{ field: "usageType" }],
            metrics: [{ measure: "usageByType", aggregation: "sum" }],
            filters: [],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          "v2",
          true,
        );

        expect(result).toHaveLength(3);

        const inputRow = result.find((r) => r["usageType"] === "input");
        expect(Number(inputRow?.["sum_usageByType"])).toBe(150); // 100 + 50

        const outputRow = result.find((r) => r["usageType"] === "output");
        expect(Number(outputRow?.["sum_usageByType"])).toBe(275); // 200 + 75
      },
    );

    maybeItWithEventsTable(
      "should produce timeseries with costType dimension and WITH FILL",
      async () => {
        const projectId = randomUUID();
        const now = new Date();

        const events = [
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            cost_details: { input: 10, output: 20 },
            start_time: now.getTime() * 1000,
          }),
        ];
        await createEventsCh(events);

        const builder = new QueryBuilder(undefined, "v2");
        const { query: sql } = await builder.build(
          {
            view: "observations",
            dimensions: [{ field: "costType" }],
            metrics: [{ measure: "costByType", aggregation: "sum" }],
            filters: [],
            timeDimension: { granularity: "day" },
            fromTimestamp: new Date(now.getTime() - 2 * 86400000).toISOString(),
            toTimestamp: new Date(now.getTime() + 86400000).toISOString(),
            orderBy: null,
          },
          projectId,
          true,
        );

        expect(sql).toContain("WITH FILL");
        expect(sql).toContain("time_dimension");
        // GROUP BY parts may be newline-separated in the generated SQL
        expect(sql).toContain("GROUP BY costType");
        expect(sql).toMatch(/GROUP BY costType[\s,]+time_dimension/);

        const result = await executeQuery(
          projectId,
          {
            view: "observations",
            dimensions: [{ field: "costType" }],
            metrics: [{ measure: "costByType", aggregation: "sum" }],
            filters: [],
            timeDimension: { granularity: "day" },
            fromTimestamp: new Date(now.getTime() - 2 * 86400000).toISOString(),
            toTimestamp: new Date(now.getTime() + 86400000).toISOString(),
            orderBy: null,
          },
          "v2",
          true,
        );

        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty("time_dimension");
        expect(result[0]).toHaveProperty("costType");
        expect(result[0]).toHaveProperty("sum_costByType");
      },
    );

    maybeItWithEventsTable(
      "should respect type filter with pairExpand dimensions",
      async () => {
        const projectId = randomUUID();

        const events = [
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            cost_details: { input: 10 },
            start_time: Date.now() * 1000,
          }),
          createEvent({
            project_id: projectId,
            type: "SPAN",
            cost_details: { input: 999 },
            start_time: Date.now() * 1000,
          }),
        ];
        await createEventsCh(events);

        const result = await executeQuery(
          projectId,
          {
            view: "observations",
            dimensions: [{ field: "costType" }],
            metrics: [{ measure: "costByType", aggregation: "sum" }],
            filters: [
              {
                column: "type",
                operator: "=",
                value: "GENERATION",
                type: "string",
              },
            ],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          "v2",
          true,
        );

        const inputRow = result.find((r) => r["costType"] === "input");
        // Only GENERATION row contributes: 10, not 999
        expect(Number(inputRow?.["sum_costByType"])).toBeCloseTo(10, 2);
      },
    );

    maybeItWithEventsTable(
      "should aggregate cost_details by type correctly via two-level query path",
      async () => {
        // Forces the two-level path by passing useSingleLevelOptimization=false.
        // Verifies that the bare alias reference in buildInnerDimensionsPart
        // (not any()) is correct when the pairExpand dim is in GROUP BY.
        const projectId = randomUUID();

        const events = [
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            cost_details: { input: 10, output: 20, total: 30 },
            start_time: Date.now() * 1000,
          }),
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            cost_details: { input: 5, output: 15, total: 20 },
            start_time: Date.now() * 1000,
          }),
        ];
        await createEventsCh(events);

        const result = await executeQuery(
          projectId,
          {
            view: "observations",
            dimensions: [{ field: "costType" }],
            metrics: [{ measure: "costByType", aggregation: "sum" }],
            filters: [],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          "v2",
          false, // force two-level path
        );

        expect(result).toHaveLength(3);

        const inputRow = result.find((r) => r["costType"] === "input");
        expect(Number(inputRow?.["sum_costByType"])).toBeCloseTo(15, 2); // 10 + 5

        const outputRow = result.find((r) => r["costType"] === "output");
        expect(Number(outputRow?.["sum_costByType"])).toBeCloseTo(35, 2); // 20 + 15

        const totalRow = result.find((r) => r["costType"] === "total");
        expect(Number(totalRow?.["sum_costByType"])).toBeCloseTo(50, 2); // 30 + 20
      },
    );

    maybeItWithEventsTable(
      "should auto-include costType dimension when only costByType measure is requested",
      async () => {
        // Verifies requiresDimension: the query builder must inject the costType
        // dimension automatically so the ARRAY JOIN is emitted and cost_value is in scope.
        const projectId = randomUUID();

        const events = [
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            cost_details: { input: 7, output: 3 },
            start_time: Date.now() * 1000,
          }),
        ];
        await createEventsCh(events);

        // No costType dimension requested — the builder should add it automatically.
        const result = await executeQuery(
          projectId,
          {
            view: "observations",
            dimensions: [], // intentionally empty
            metrics: [{ measure: "costByType", aggregation: "sum" }],
            filters: [],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          "v2",
          true,
        );

        // costType should appear in results even though it was not explicitly requested
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty("costType");

        const inputRow = result.find((r) => r["costType"] === "input");
        expect(Number(inputRow?.["sum_costByType"])).toBeCloseTo(7, 2);

        const outputRow = result.find((r) => r["costType"] === "output");
        expect(Number(outputRow?.["sum_costByType"])).toBeCloseTo(3, 2);
      },
    );

    it("should throw when multiple pairExpand dimensions are requested directly", async () => {
      // Two separate ARRAY JOIN clauses create a cartesian product in ClickHouse.
      const projectId = randomUUID();
      const builder = new QueryBuilder(undefined, "v2");

      await expect(
        builder.build(
          {
            view: "observations",
            dimensions: [{ field: "costType" }, { field: "usageType" }],
            metrics: [{ measure: "costByType", aggregation: "sum" }],
            filters: [],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          projectId,
          true,
        ),
      ).rejects.toThrow("Only one pairExpand dimension is supported per query");
    });

    it("should throw when both costByType and usageByType measures are requested (auto-inject creates two pairExpand dims)", async () => {
      // Each measure auto-injects its required pairExpand dimension via requiresDimension.
      // Requesting both triggers the multi-pairExpand guard.
      const projectId = randomUUID();
      const builder = new QueryBuilder(undefined, "v2");

      await expect(
        builder.build(
          {
            view: "observations",
            dimensions: [],
            metrics: [
              { measure: "costByType", aggregation: "sum" },
              { measure: "usageByType", aggregation: "sum" },
            ],
            filters: [],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          projectId,
          true,
        ),
      ).rejects.toThrow("Only one pairExpand dimension is supported per query");
    });
  });
});
