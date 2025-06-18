import { describe, it, expect, beforeEach, vi } from "vitest";
import { WidgetConfiguration } from "../domain/dashboard/widgetConfigurations";
import { createColumnRegistry } from "../server/utils/transforms/clickHouseColumnRegistry";
import { ClickHouseQueryTransformer } from "../server/utils/transforms/clickHouseQueryTransformer.ts";

describe("ClickHouseQueryTransformer", () => {
  let transformer: ClickHouseQueryTransformer;
  const testProjectId = "test-project-123";

  beforeEach(() => {
    transformer = new ClickHouseQueryTransformer(createColumnRegistry());
  });

  describe("Basic Query Generation", () => {
    it("should generate simple SELECT query", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "traces", alias: "t", useFinal: true },
        selectedColumns: [
          { tableId: "traces", columnId: "id" },
          { tableId: "traces", columnId: "name" },
        ],
        aggregations: [],
        groupByColumns: [],
        filters: [],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain('SELECT t."id", t."name"');
      expect(result.query).toContain("FROM traces FINAL t");
      expect(result.query).toContain(
        'WHERE t."project_id" = {projectId:String}',
      );
      expect(result.parameters.projectId).toBe(testProjectId);
    });

    it("should handle table without FINAL keyword", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "traces", alias: "t", useFinal: false },
        selectedColumns: [{ tableId: "traces", columnId: "id" }],
        aggregations: [],
        groupByColumns: [],
        filters: [],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain("FROM traces t");
      expect(result.query).not.toContain("FINAL");
    });

    it("should handle columns with aliases", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "traces", alias: "t", useFinal: true },
        selectedColumns: [
          { tableId: "traces", columnId: "id", alias: "trace_id" },
          { tableId: "traces", columnId: "name", alias: "trace_name" },
        ],
        aggregations: [],
        groupByColumns: [],
        filters: [],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain('t."id" as trace_id');
      expect(result.query).toContain('t."name" as trace_name');
    });
  });

  describe("Aggregation Queries", () => {
    it("should generate COUNT aggregation", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "scores", alias: "s", useFinal: true },
        selectedColumns: [],
        aggregations: [
          {
            function: "COUNT",
            column: { tableId: "scores", columnId: "id" },
            alias: "total_scores",
          },
        ],
        groupByColumns: [],
        filters: [],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain('COUNT(s."id") as total_scores');
      expect(result.query).not.toContain("GROUP BY");
    });

    it("should generate SUM aggregation with GROUP BY", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "scores", alias: "s", useFinal: true },
        selectedColumns: [{ tableId: "scores", columnId: "name" }],
        aggregations: [
          {
            function: "SUM",
            column: { tableId: "scores", columnId: "value" },
            alias: "total_value",
          },
        ],
        groupByColumns: [{ column: { tableId: "scores", columnId: "name" } }],
        filters: [],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain('SUM(s."value") as total_value');
      expect(result.query).toContain('GROUP BY s."name"');
    });

    it("should handle multiple aggregations", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "observations", alias: "o", useFinal: true },
        selectedColumns: [],
        aggregations: [
          {
            function: "COUNT",
            column: { tableId: "observations", columnId: "id" },
            alias: "obs_count",
          },
          {
            function: "AVG",
            column: { tableId: "observations", columnId: "latency" },
            alias: "avg_latency",
          },
          {
            function: "SUM",
            column: { tableId: "observations", columnId: "totalCost" },
            alias: "total_cost",
          },
        ],
        groupByColumns: [],
        filters: [],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain('COUNT(o."id") as obs_count');
      expect(result.query).toContain(
        "AVG(if(isNull(end_time), NULL, date_diff('millisecond', start_time, end_time) / 1000)) as avg_latency",
      );
      expect(result.query).toContain(
        "SUM(if(mapExists((k, v) -> (k = 'total'), cost_details), cost_details['total'], NULL)) as total_cost",
      );
    });

    it("should handle COUNT DISTINCT aggregation", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "traces", alias: "t", useFinal: true },
        selectedColumns: [],
        aggregations: [
          {
            function: "COUNT_DISTINCT",
            column: { tableId: "traces", columnId: "user_id" },
            alias: "unique_users",
          },
        ],
        groupByColumns: [],
        filters: [],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain(
        'SELECT COUNT(DISTINCT t."user_id") as unique_users',
      );
    });
  });

  describe("JOIN Queries", () => {
    it("should generate LEFT JOIN", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "observations", alias: "o", useFinal: true },
        selectedColumns: [
          { tableId: "observations", columnId: "id" },
          { tableId: "traces", columnId: "name" },
        ],
        aggregations: [],
        groupByColumns: [],
        filters: [],
        joinTables: [
          {
            table: { name: "traces", alias: "t", useFinal: true },
            joinType: "LEFT",
            onCondition: "t.id = o.trace_id AND t.project_id = o.project_id",
          },
        ],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain(
        "LEFT JOIN traces FINAL t ON t.id = o.trace_id AND t.project_id = o.project_id",
      );
    });

    it("should generate multiple JOINs", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "observations", alias: "o", useFinal: true },
        selectedColumns: [
          { tableId: "observations", columnId: "id" },
          { tableId: "traces", columnId: "name" },
          { tableId: "scores", columnId: "value" },
        ],
        aggregations: [],
        groupByColumns: [],
        filters: [],
        joinTables: [
          {
            table: { name: "traces", alias: "t", useFinal: true },
            joinType: "LEFT",
            onCondition: "t.id = o.trace_id",
          },
          {
            table: { name: "scores", alias: "s", useFinal: true },
            joinType: "LEFT",
            onCondition: "s.observation_id = o.id",
          },
        ],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain(
        "LEFT JOIN traces FINAL t ON t.id = o.trace_id",
      );
      expect(result.query).toContain(
        "LEFT JOIN scores FINAL s ON s.observation_id = o.id",
      );
    });

    it("should handle different JOIN types", () => {
      const joinTypes = ["INNER", "LEFT", "RIGHT", "FULL"] as const;

      joinTypes.forEach((joinType) => {
        const representation: WidgetConfiguration = {
          primaryTable: { name: "observations", alias: "o", useFinal: true },
          selectedColumns: [{ tableId: "observations", columnId: "id" }],
          aggregations: [],
          groupByColumns: [],
          filters: [],
          joinTables: [
            {
              table: { name: "traces", alias: "t", useFinal: true },
              joinType,
              onCondition: "t.id = o.trace_id",
            },
          ],
        };

        const result = transformer.transform(representation, testProjectId);
        expect(result.query).toContain(
          `${joinType} JOIN traces FINAL t ON t.id = o.trace_id`,
        );
      });
    });
  });

  describe("Filter Queries", () => {
    it("should handle equality filters", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "traces", alias: "t", useFinal: true },
        selectedColumns: [{ tableId: "traces", columnId: "id" }],
        aggregations: [],
        groupByColumns: [],
        filters: [
          {
            column: { tableId: "traces", columnId: "environment" },
            operator: "=",
            value: "production",
          },
        ],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain('t."environment" = {filter_0:String}');
      expect(result.parameters.filter_0).toBe("production");
    });

    it("should handle comparison filters", () => {
      const operators = [">", "<", ">=", "<=", "!="] as const;

      operators.forEach((operator) => {
        const representation: WidgetConfiguration = {
          primaryTable: { name: "scores", alias: "s", useFinal: true },
          selectedColumns: [{ tableId: "scores", columnId: "id" }],
          aggregations: [],
          groupByColumns: [],
          filters: [
            {
              column: { tableId: "scores", columnId: "value" },
              operator,
              value: 0.5,
            },
          ],
        };

        const result = transformer.transform(representation, testProjectId);
        expect(result.query).toContain(
          `s."value" ${operator} {filter_0:String}`,
        );
      });
    });

    it("should handle IN filters", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "traces", alias: "t", useFinal: true },
        selectedColumns: [{ tableId: "traces", columnId: "id" }],
        aggregations: [],
        groupByColumns: [],
        filters: [
          {
            column: { tableId: "traces", columnId: "environment" },
            operator: "IN",
            value: ["production", "staging"],
          },
        ],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain(
        't."environment" IN {filter_0:Array(String)}',
      );
      expect(result.parameters.filter_0).toEqual(["production", "staging"]);
    });

    it("should handle LIKE filters", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "traces", alias: "t", useFinal: true },
        selectedColumns: [{ tableId: "traces", columnId: "id" }],
        aggregations: [],
        groupByColumns: [],
        filters: [
          {
            column: { tableId: "traces", columnId: "name" },
            operator: "LIKE",
            value: "%test%",
          },
        ],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain('t."name" LIKE {filter_0:String}');
      expect(result.parameters.filter_0).toBe("%test%");
    });

    it("should handle BETWEEN filters", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "traces", alias: "t", useFinal: true },
        selectedColumns: [{ tableId: "traces", columnId: "id" }],
        aggregations: [],
        groupByColumns: [],
        filters: [
          {
            column: { tableId: "traces", columnId: "timestamp" },
            operator: "BETWEEN",
            value: [1000, 2000],
          },
        ],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain(
        't."timestamp" BETWEEN {filter_0_start:String} AND {filter_0_end:String}',
      );
      expect(result.parameters.filter_0_start).toBe(1000);
      expect(result.parameters.filter_0_end).toBe(2000);
    });

    it("should handle multiple filters", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "traces", alias: "t", useFinal: true },
        selectedColumns: [{ tableId: "traces", columnId: "id" }],
        aggregations: [],
        groupByColumns: [],
        filters: [
          {
            column: { tableId: "traces", columnId: "environment" },
            operator: "=",
            value: "production",
          },
          {
            column: { tableId: "traces", columnId: "name" },
            operator: "LIKE",
            value: "%api%",
          },
        ],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain(
        'WHERE t."project_id" = {projectId:String} AND t."environment" = {filter_0:String} AND t."name" LIKE {filter_1:String}',
      );
      expect(result.parameters.filter_0).toBe("production");
      expect(result.parameters.filter_1).toBe("%api%");
    });
  });

  describe("Time Series Queries", () => {
    it("should generate hourly time series query", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "observations", alias: "o", useFinal: true },
        selectedColumns: [],
        aggregations: [
          {
            function: "COUNT",
            column: { tableId: "observations", columnId: "id" },
            alias: "hourly_count",
          },
        ],
        groupByColumns: [
          {
            column: { tableId: "observations", columnId: "startTime" },
            bucketSize: "hour",
          },
        ],
        filters: [],
        timeSeriesConfig: {
          timeColumn: "start_time",
          bucketSize: "hour",
          orderBy: "ASC",
          fillGaps: true,
        },
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain(
        'SELECT toStartOfHour(o."start_time") as start_time',
      );
      expect(result.query).toContain('COUNT(o."id") as hourly_count');
      expect(result.query).toContain('GROUP BY toStartOfHour(o."start_time")');
      expect(result.query).toContain("ORDER BY start_time ASC WITH FILL");
    });

    it("should handle different time bucket sizes", () => {
      const bucketSizes = [
        { size: "minute", expected: "toStartOfMinute" },
        { size: "hour", expected: "toStartOfHour" },
        { size: "day", expected: "toStartOfDay" },
        { size: "week", expected: "toStartOfWeek" },
        { size: "month", expected: "toStartOfMonth" },
      ] as const;

      bucketSizes.forEach(({ size, expected }) => {
        const representation: WidgetConfiguration = {
          primaryTable: { name: "observations", alias: "o", useFinal: true },
          selectedColumns: [],
          aggregations: [
            {
              function: "COUNT",
              column: { tableId: "observations", columnId: "id" },
              alias: "count",
            },
          ],
          groupByColumns: [
            {
              column: { tableId: "observations", columnId: "startTime" },
              bucketSize: size,
            },
          ],
          filters: [],
          timeSeriesConfig: {
            timeColumn: "start_time",
            bucketSize: size,
            orderBy: "ASC",
            fillGaps: false,
          },
        };

        const result = transformer.transform(representation, testProjectId);
        expect(result.query).toContain(expected);
      });
    });

    it("should handle time series without gap filling", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "observations", alias: "o", useFinal: true },
        selectedColumns: [],
        aggregations: [
          {
            function: "COUNT",
            column: { tableId: "observations", columnId: "id" },
            alias: "count",
          },
        ],
        groupByColumns: [
          {
            column: { tableId: "observations", columnId: "startTime" },
            bucketSize: "hour",
          },
        ],
        filters: [],
        timeSeriesConfig: {
          timeColumn: "start_time",
          bucketSize: "hour",
          orderBy: "DESC",
          fillGaps: false,
        },
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain("ORDER BY start_time DESC");
      expect(result.query).not.toContain("WITH FILL");
    });
  });

  describe("Complex Expressions", () => {
    it("should handle complex cost calculations", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "observations", alias: "o", useFinal: true },
        selectedColumns: [],
        aggregations: [
          {
            function: "SUM",
            column: { tableId: "observations", columnId: "inputCost" },
            alias: "total_input_cost",
          },
          {
            function: "SUM",
            column: { tableId: "observations", columnId: "outputCost" },
            alias: "total_output_cost",
          },
        ],
        groupByColumns: [],
        filters: [],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain(
        "SUM(arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, cost_details)))) as total_input_cost",
      );
      expect(result.query).toContain(
        "SUM(arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, cost_details)))) as total_output_cost",
      );
    });

    it("should handle latency calculations", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "observations", alias: "o", useFinal: true },
        selectedColumns: [],
        aggregations: [
          {
            function: "AVG",
            column: { tableId: "observations", columnId: "latency" },
            alias: "avg_latency",
          },
        ],
        groupByColumns: [],
        filters: [],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain(
        "AVG(if(isNull(end_time), NULL, date_diff('millisecond', start_time, end_time) / 1000)) as avg_latency",
      );
    });

    it("should handle custom expressions", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "observations", alias: "o", useFinal: true },
        selectedColumns: [
          {
            tableId: "observations",
            columnId: "custom_completion_rate",
            customExpression:
              "CASE WHEN o.end_time IS NOT NULL THEN 1 ELSE 0 END",
            alias: "is_completed",
          },
        ],
        aggregations: [],
        groupByColumns: [],
        filters: [],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain(
        "CASE WHEN o.end_time IS NOT NULL THEN 1 ELSE 0 END as is_completed",
      );
    });
  });

  describe("ORDER BY and LIMIT", () => {
    it("should handle ORDER BY clauses", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "traces", alias: "t", useFinal: true },
        selectedColumns: [{ tableId: "traces", columnId: "name" }],
        aggregations: [
          {
            function: "COUNT",
            column: { tableId: "traces", columnId: "id" },
            alias: "trace_count",
          },
        ],
        groupByColumns: [{ column: { tableId: "traces", columnId: "name" } }],
        filters: [],
        orderBy: [
          { column: "trace_count", direction: "DESC" },
          { column: "name", direction: "ASC" },
        ],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain("ORDER BY trace_count DESC, name ASC");
    });

    it("should handle LIMIT clause", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "traces", alias: "t", useFinal: true },
        selectedColumns: [{ tableId: "traces", columnId: "id" }],
        aggregations: [],
        groupByColumns: [],
        filters: [],
        limit: 100,
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain("LIMIT 100");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty selected columns with aggregations only", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "traces", alias: "t", useFinal: true },
        selectedColumns: [],
        aggregations: [
          {
            function: "COUNT",
            column: { tableId: "traces", columnId: "id" },
            alias: "total_traces",
          },
        ],
        groupByColumns: [],
        filters: [],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain('SELECT COUNT(t."id") as total_traces');
      expect(result.query).not.toContain("GROUP BY");
    });

    it("should handle missing column definitions gracefully", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "traces", alias: "t", useFinal: true },
        selectedColumns: [
          { tableId: "traces", columnId: "nonexistent_column" },
        ],
        aggregations: [],
        groupByColumns: [],
        filters: [],
      };

      expect(() => {
        transformer.transform(representation, testProjectId);
      }).not.toThrow();
    });

    it("should handle empty filters array", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "traces", alias: "t", useFinal: true },
        selectedColumns: [{ tableId: "traces", columnId: "id" }],
        aggregations: [],
        groupByColumns: [],
        filters: [],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain(
        'WHERE t."project_id" = {projectId:String}',
      );
      expect(result.parameters).toEqual({ projectId: testProjectId });
    });

    it("should handle null and undefined values in filters", () => {
      const representation: WidgetConfiguration = {
        primaryTable: { name: "traces", alias: "t", useFinal: true },
        selectedColumns: [{ tableId: "traces", columnId: "id" }],
        aggregations: [],
        groupByColumns: [],
        filters: [
          {
            column: { tableId: "traces", columnId: "user_id" },
            operator: "=",
            value: null,
          },
        ],
      };

      const result = transformer.transform(representation, testProjectId);

      expect(result.query).toContain('t."user_id" = {filter_0:String}');
      expect(result.parameters.filter_0).toBeNull();
    });
  });

  describe("Performance Tests", () => {
    it("should transform complex queries quickly", () => {
      const complexRepresentation: WidgetConfiguration = {
        primaryTable: { name: "observations", alias: "o", useFinal: true },
        selectedColumns: [
          { tableId: "traces", columnId: "name" },
          { tableId: "observations", columnId: "name" },
        ],
        aggregations: [
          {
            function: "COUNT",
            column: { tableId: "observations", columnId: "id" },
            alias: "obs_count",
          },
          {
            function: "SUM",
            column: { tableId: "observations", columnId: "totalCost" },
            alias: "total_cost",
          },
          {
            function: "AVG",
            column: { tableId: "scores", columnId: "value" },
            alias: "avg_score",
          },
        ],
        groupByColumns: [
          { column: { tableId: "traces", columnId: "name" } },
          {
            column: { tableId: "observations", columnId: "startTime" },
            bucketSize: "hour",
          },
        ],
        filters: [
          {
            column: { tableId: "traces", columnId: "environment" },
            operator: "IN",
            value: ["production", "staging"],
          },
          {
            column: { tableId: "scores", columnId: "value" },
            operator: ">",
            value: 0.5,
          },
        ],
        joinTables: [
          {
            table: { name: "traces", alias: "t", useFinal: true },
            joinType: "LEFT",
            onCondition: "t.id = o.trace_id",
          },
          {
            table: { name: "scores", alias: "s", useFinal: true },
            joinType: "LEFT",
            onCondition: "s.observation_id = o.id",
          },
        ],
        timeSeriesConfig: {
          timeColumn: "start_time",
          bucketSize: "hour",
          orderBy: "ASC",
          fillGaps: true,
        },
        limit: 1000,
      };

      const startTime = Date.now();
      const result = transformer.transform(
        complexRepresentation,
        testProjectId,
      );
      const transformTime = Date.now() - startTime;

      expect(transformTime).toBeLessThan(100); // Should complete in under 100ms
      expect(result.query).toBeDefined();
      expect(result.parameters).toBeDefined();
    });
  });
});
