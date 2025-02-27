import { pruneDatabase } from "@/src/__tests__/test-utils";
import {
  createQuery,
  enrichAndCreateQuery,
} from "@/src/server/api/services/queryBuilder";
describe("Build valid SQL queries", () => {
  beforeEach(async () => await pruneDatabase());

  describe("should enrich mandatory filters", () => {
    [
      {
        table: "traces",
        values: ["project-id"],
        strings: [' FROM  traces t  WHERE  t."project_id" = ', ";"],
      } as const,
      {
        table: "traces_metrics",
        values: ["project-id"],
        strings: [' FROM traces_view t  WHERE  t."project_id" = ', ";"],
      } as const,
      {
        table: "traces_observations",
        values: ["project-id", "project-id"],
        strings: [
          ' FROM  traces t LEFT JOIN observations o ON t.id = o.trace_id  WHERE  t."project_id" = ',
          ' AND o."project_id" = ',
          ";",
        ],
      } as const,
      {
        table: "traces_observationsview",
        values: ["project-id", "project-id"],
        strings: [
          ' FROM  traces t LEFT JOIN observations_view o ON t.id = o.trace_id  WHERE  t."project_id" = ',
          ' AND o."project_id" = ',
          ";",
        ],
      } as const,
      {
        table: "observations",
        values: ["project-id"],
        strings: [' FROM  observations_view o  WHERE  o."project_id" = ', ";"],
      } as const,
      {
        table: "traces_scores",
        values: ["project-id"],
        strings: [
          ` FROM  traces t JOIN scores s ON t.id = s.trace_id AND t.project_id = s.project_id  WHERE  t."project_id" = `,
          ";",
        ],
      } as const,
    ].forEach((prop) => {
      it(`should enrich mandatory filters ${prop.table}`, () => {
        const preparedQuery = enrichAndCreateQuery("project-id", {
          from: prop.table,
          select: [],
        });
        expect(preparedQuery.values).toEqual(prop.values);
        expect(preparedQuery.strings).toEqual(prop.strings);
      });
    });
  });

  describe("should build safe SQL", () => {
    it("should build a simple filter query", () => {
      const preparedQuery = createQuery({
        from: "traces",
        filter: [
          {
            type: "string" as const,
            column: "tracesProjectId",
            operator: "=" as const,
            value: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          },
        ],

        select: [{ column: "traceId" }],
      });

      expect(preparedQuery.values).toEqual([
        "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      ]);
    });

    it("should build a simple group by and filter query", () => {
      const preparedQuery = createQuery({
        from: "traces",
        filter: [
          {
            type: "string" as const,
            column: "tracesProjectId",
            operator: "=" as const,
            value: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          },
        ],
        groupBy: [{ type: "string", column: "version" }],
        select: [{ column: "traceId" }],
      });

      expect(preparedQuery.values).toEqual([
        "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      ]);
    });

    it("should build a time series group", () => {
      const preparedQuery = createQuery({
        from: "observations",
        filter: [
          {
            type: "datetime",
            column: "startTime",
            operator: ">=",
            value: new Date("2021-01-01T00:00:00.000Z"),
          },
          {
            type: "datetime",
            column: "startTime",
            operator: "<=",
            value: new Date("2021-01-04T00:00:00.000Z"),
          },
        ],
        groupBy: [
          { type: "datetime", column: "startTime", temporalUnit: "day" },
        ],
        select: [{ column: "completionTokens", agg: "SUM" }],
      });

      expect(preparedQuery.values).toEqual([
        new Date("2021-01-01T00:00:00.000Z"),
        new Date("2021-01-04T00:00:00.000Z"),
        new Date("2021-01-01T00:00:00.000Z"),
        new Date("2021-01-04T00:00:00.000Z"),
      ]);
    });

    it("should not filter an unknown column", () => {
      expect(() =>
        createQuery({
          from: "traces",
          filter: [
            { type: "string", column: "unknown", operator: "=", value: "" },
          ],
          select: [],
        }),
      ).toThrow("Invalid filter column: unknown");
    });

    it("should not select an unknown column", () => {
      expect(() =>
        createQuery({
          from: "traces",
          select: [{ column: "unknown" }],
        }),
      ).toThrow('Column "unknown" not found in table traces');
    });

    it("should not group by an unknown column", () => {
      expect(() =>
        createQuery({
          from: "traces",
          groupBy: [{ column: "unknown", type: "string" }],
          select: [],
        }),
      ).toThrow('Column "unknown" not found in table traces');
    });

    it("should not order by an unknown column", () => {
      expect(() =>
        createQuery({
          from: "traces",
          select: [],
          orderBy: [{ column: "unknown", direction: "ASC" }],
        }),
      ).toThrow('Column "unknown" not found in table traces');
    });
  });
});
