import { pruneDatabase } from "@/src/__tests__/test-utils";
import {
  type DatabaseRow,
  executeQuery,
  isArrayOfDatabaseRow,
} from "@/src/server/api/services/query-builder";
import { prisma } from "@/src/server/db";
import Decimal from "decimal.js";

// Create test cases
describe("Build valid SQL queries", () => {
  beforeEach(async () => await pruneDatabase());
  afterEach(async () => await pruneDatabase());

  it("should get a simple trace", async () => {
    await prisma.trace.create({
      data: {
        id: "trace-1",
        name: "trace-1",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        userId: "user-1",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      },
    });

    const result = await executeQuery({
      from: "traces",
      filter: [],
      groupBy: [],
      select: [{ column: "id", agg: null }],
    });

    expect(result).toEqual([{ id: "trace-1" }]);
  });

  [
    { agg: "SUM", one: 8, two: 4 },
    { agg: "AVG", one: 4, two: 4 },
    { agg: "MIN", one: 3, two: 4 },
    { agg: "MAX", one: 5, two: 4 },
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

      const result = await executeQuery({
        from: "observations",
        filter: [],
        groupBy: [{ type: "string", column: "name" }],
        select: [
          { column: "completionTokens", agg: prop.agg as "SUM" | "AVG" },
          { column: "name", agg: null },
        ],
      });

      if (isArrayOfDatabaseRow(result)) {
        result.map((x, i) => {
          if (i === 0) {
            expect(x.completionTokens!.toString()).toStrictEqual(
              prop.one.toString(),
            );
            expect(x.name).toStrictEqual("trace-1");
          }
          if (i === 1) {
            expect(x.completionTokens!.toString()).toStrictEqual(
              prop.two.toString(),
            );
            expect(x.name).toStrictEqual("trace-2");
          }
        });
      } else {
        throw Error("Expected result to be an array of Database Row");
      }
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

      const result = await executeQuery({
        from: "observations",
        filter: [
          {
            type: "datetime",
            column: "startTime",
            operator: ">",
            value: new Date("2021-01-01T00:00:00.000Z"),
          },
          {
            type: "datetime",
            column: "startTime",
            operator: "<",
            value: new Date("2021-01-04T00:00:00.000Z"),
          },
        ],
        groupBy: [
          { type: "datetime", column: "startTime", temporalUnit: "day" },
        ],
        select: [
          { column: "completionTokens", agg: prop.agg as "SUM" | "AVG" },
        ],
      });

      expect(result).toStrictEqual([
        {
          startTime: new Date("2021-01-04T00:00:00.000Z"),
          completionTokens: null,
        },
        {
          startTime: new Date("2021-01-03T00:00:00.000Z"),
          completionTokens: null,
        },
        {
          startTime: new Date("2021-01-02T00:00:00.000Z"),
          completionTokens: 4,
        },
        {
          startTime: new Date("2021-01-01T00:00:00.000Z"),
          completionTokens: 8,
        },
      ]);
    });
  });
});
