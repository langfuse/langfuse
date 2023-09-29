import { pruneDatabase } from "@/src/__tests__/test-utils";
import {
  createQuery,
  executeQuery,
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

    const query = createQuery({
      from: "traces",
      filter: [],
      groupBy: [],
      select: [{ column: "id", agg: null }],
    });

    const result = await executeQuery(query);
    expect(result).toEqual([{ id: "trace-1" }]);
  });

  [
    { agg: "SUM", one: BigInt(8), two: BigInt(4) },
    { agg: "AVG", one: new Decimal("4"), two: new Decimal("4") },
    { agg: "MIN", one: new Decimal("3"), two: new Decimal("4") },
    { agg: "MAX", one: new Decimal("5"), two: new Decimal("4") },
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
            id: "trace-1",
            traceId: "trace-1",
            name: "trace-1",
            projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
            type: "GENERATION",
            completionTokens: 5,
          },
          {
            id: "trace-2",
            traceId: "trace-1",
            name: "trace-1",
            projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
            type: "GENERATION",
            completionTokens: 3,
          },
          {
            id: "trace-3",
            traceId: "trace-1",
            name: "trace-2",
            projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
            type: "GENERATION",
            completionTokens: 4,
          },
        ],
      });

      const query = createQuery({
        from: "observations",
        filter: [],
        groupBy: [{ type: "string", column: "name" }],
        select: [
          { column: "completion_tokens", agg: prop.agg as "SUM" | "AVG" },
          { column: "name", agg: null },
        ],
      });

      const result = await executeQuery<DatabaseRow[]>(query);

      if (isArrayOfDatabaseRow(result)) {
        result.map((x, i) => {
          console.log(
            x.completion_tokens,
            typeof x.completion_tokens,
            x.completion_tokens instanceof Decimal,
            Decimal.isDecimal(x.completion_tokens),
          );

          if (i === 0)
            expect(x.completion_tokens.toString()).toStrictEqual(
              prop.one.toString(),
            );
          if (i === 1)
            expect(x.completion_tokens.toString()).toStrictEqual(
              prop.two.toString(),
            );
        });
      } else {
        fail("Expected result to be an array of Database Row");
      }
    });
  });
});

type DatabaseRow = {
  completion_tokens: bigint | number | Decimal;
  name: string;
};

function isDatabaseRow(value: unknown): value is DatabaseRow {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Partial<DatabaseRow>;

  const isBigIntOrDecimal = (x: unknown): x is bigint | Decimal | number => {
    return (
      typeof x === "bigint" ||
      typeof x === "number" ||
      (typeof x === "object" && x !== null && Decimal.isDecimal(x))
    );
  };

  return (
    "name" in obj &&
    typeof obj.name === "string" &&
    "completion_tokens" in obj &&
    isBigIntOrDecimal(obj.completion_tokens)
  );
}

function isArrayOfDatabaseRow(value: unknown): value is DatabaseRow[] {
  return Array.isArray(value) && value.every(isDatabaseRow);
}
