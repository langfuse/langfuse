import { pruneDatabase } from "@/src/__tests__/test-utils";
import {
  createQuery,
  enrichAndCreateQuery,
  executeQuery,
} from "@/src/server/api/services/query-builder";
import { prisma } from "@/src/server/db";

describe("Build valid SQL queries", () => {
  beforeEach(async () => await pruneDatabase());

  describe("should enrich mandatory filters", () => {
    [
      {
        table: "traces",
        values: ["project-id"],
        strings: [' FROM  traces t  WHERE  t."project_id" = ', " ;"],
      } as const,
      {
        table: "traces_observations",
        values: ["project-id", "project-id"],
        strings: [
          ' FROM  traces t LEFT JOIN observations o ON t.id = o.trace_id  WHERE  t."project_id" = ',
          '  AND o."project_id" = ',
          " ;",
        ],
      } as const,
      {
        table: "observations",
        values: ["project-id"],
        strings: [' FROM  observations o  WHERE  o."project_id" = ', " ;"],
      } as const,
      {
        table: "traces_scores",
        values: ["project-id"],
        strings: [
          ' FROM  traces t JOIN scores s ON t.id = s.trace_id  WHERE  t."project_id" = ',
          " ;",
        ],
      } as const,
    ].forEach((prop) => {
      it(`should enrich mandatory filters ${prop.table}`, () => {
        const preparedQuery = enrichAndCreateQuery("project-id", {
          from: prop.table,
          filter: [],
          groupBy: [],
          select: [],
          orderBy: [],
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
        groupBy: [],
        select: [{ column: "id", agg: null }],
        orderBy: [],
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
        select: [{ column: "id", agg: null }],
        orderBy: [],
      });

      expect(preparedQuery.values).toEqual([
        "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      ]);
    });
    it("should not filter an unknown column", () => {
      expect(() =>
        createQuery({
          from: "traces",
          filter: [
            { type: "string", column: "unknown", operator: "=", value: "" },
          ],
          groupBy: [],
          select: [],
          orderBy: [],
        }),
      ).toThrow("Column unknown not found");
    });

    it("should not select an unknown column", () => {
      expect(() =>
        createQuery({
          from: "traces",
          filter: [],
          groupBy: [],
          select: [{ column: "unknown", agg: null }],
          orderBy: [],
        }),
      ).toThrow("Column unknown not found");
    });

    it("should not group by an unknown column", () => {
      expect(() =>
        createQuery({
          from: "traces",
          filter: [],
          groupBy: [{ column: "unknown", type: "string" }],
          select: [],
          orderBy: [],
        }),
      ).toThrow("Column unknown not found");
    });

    it("should not order by an unknown column", () => {
      expect(() =>
        createQuery({
          from: "traces",
          filter: [],
          groupBy: [],
          select: [],
          orderBy: [{ column: "unknown", direction: "ASC" }],
        }),
      ).toThrow("Column unknown not found");
    });
  });

  describe("should retrieve data", () => {
    it("should get a simple trace", async () => {
      await prisma.project.upsert({
        where: { id: "different-project-id" },
        create: {
          id: "different-project-id",
          name: "test-project",
        },
        update: {},
      });

      await prisma.trace.createMany({
        data: [
          {
            id: "trace-1",
            name: "trace-1",
            projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
            userId: "user-1",
            metadata: { key: "value" },
            release: "1.0.0",
            version: "2.0.0",
          },
          {
            id: "trace-2",
            name: "trace-1",
            projectId: "different-project-id",
            userId: "user-1",
            metadata: { key: "value" },
            release: "1.0.0",
            version: "2.0.0",
          },
        ],
      });

      const result = await executeQuery(
        prisma,
        "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        {
          from: "traces",
          filter: [],
          groupBy: [],
          select: [{ column: "id", agg: null }],
          orderBy: [],
        },
      );

      expect(result).toEqual([{ id: "trace-1" }]);
    });

    [
      {
        agg: "SUM",
        first: { sumCompletionTokens: 8, name: "trace-1" },
        second: { sumCompletionTokens: 4, name: "trace-2" },
      },
      {
        agg: "AVG",
        first: { avgCompletionTokens: 4, name: "trace-1" },
        second: { avgCompletionTokens: 4, name: "trace-2" },
      },
      {
        agg: "MIN",
        first: { minCompletionTokens: 3, name: "trace-1" },
        second: { minCompletionTokens: 4, name: "trace-2" },
      },
      {
        agg: "MAX",
        first: { maxCompletionTokens: 5, name: "trace-1" },
        second: { maxCompletionTokens: 4, name: "trace-2" },
      },
      {
        agg: "COUNT",
        first: { countCompletionTokens: 2, name: "trace-1" },
        second: { countCompletionTokens: 1, name: "trace-2" },
      },
    ].forEach((prop) => {
      it(`should group by name and aggregate ${prop.agg}`, async () => {
        await prisma.trace.create({
          data: {
            id: "trace-1",
            name: "trace-1",
            projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          },
        });

        await prisma.observation.createMany({
          data: [
            {
              traceId: "trace-1",
              name: "trace-1",
              projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
              type: "GENERATION",
              completionTokens: 5,
            },
            {
              traceId: "trace-1",
              name: "trace-1",
              projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
              type: "GENERATION",
              completionTokens: 3,
            },
            {
              traceId: "trace-1",
              name: "trace-2",
              projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
              type: "GENERATION",
              completionTokens: 4,
            },
          ],
        });

        const result = await executeQuery(
          prisma,
          "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          {
            from: "observations",
            filter: [],
            groupBy: [{ type: "string", column: "name" }],
            select: [
              { column: "completionTokens", agg: prop.agg as "SUM" | "AVG" },
              { column: "name", agg: null },
            ],
            orderBy: [],
          },
        );

        expect(result[0]!).toStrictEqual(prop.first);
        expect(result[1]!).toStrictEqual(prop.second);
      });
    });

    [{ agg: "SUM", one: 8, two: 4 }].forEach((prop) => {
      it(`should aggregate time series ${prop.agg}`, async () => {
        await prisma.trace.create({
          data: {
            id: "trace-1",
            name: "trace-1",
            projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          },
        });

        await prisma.observation.createMany({
          data: [
            {
              traceId: "trace-1",
              name: "trace-1",
              projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
              type: "GENERATION",
              completionTokens: 5,
              startTime: new Date("2021-01-01T00:00:00.000Z"),
            },
            {
              traceId: "trace-1",
              name: "trace-1",
              projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
              type: "GENERATION",
              completionTokens: 3,
              startTime: new Date("2021-01-01T00:00:00.000Z"),
            },
            {
              traceId: "trace-1",
              name: "trace-2",
              projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
              type: "GENERATION",
              completionTokens: 4,
              startTime: new Date("2021-01-02T00:00:00.000Z"),
            },
          ],
        });

        const result = await executeQuery(
          prisma,
          "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          {
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
            select: [
              { column: "completionTokens", agg: prop.agg as "SUM" | "AVG" },
            ],
            orderBy: [],
          },
        );

        expect(result).toStrictEqual([
          {
            startTime: new Date("2021-01-01T00:00:00.000Z"),
            sumCompletionTokens: 8,
          },
          {
            startTime: new Date("2021-01-02T00:00:00.000Z"),
            sumCompletionTokens: 4,
          },
          {
            startTime: new Date("2021-01-03T00:00:00.000Z"),
            sumCompletionTokens: null,
          },
          {
            startTime: new Date("2021-01-04T00:00:00.000Z"),
            sumCompletionTokens: null,
          },
        ]);
      });
    });
  });
});
