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
      select: [{ field: "id", agg: null }],
    });

    const result = await executeQuery(query);
    expect(result).toEqual([{ id: "trace-1" }]);
  });

  [
    { agg: "SUM", one: BigInt(8), two: BigInt(4) },
    { agg: "AVG", one: new Decimal("4"), two: new Decimal("4") },
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
        groupBy: [{ type: "string", name: "name" }],
        select: [
          { field: "completion_tokens", agg: prop.agg as "SUM" | "AVG" },
          { field: "name", agg: null },
        ],
      });

      const result = await executeQuery(query);

      if (isArrayOfMyType(result)) {
        result.map((x, i) => {
          if (i === 0) expect(x.completion_tokens).toEqual(prop.one);
          if (i === 1) expect(x.completion_tokens).toEqual(prop.two);
        });

        expect(result).toStrictEqual([
          { completion_tokens: prop.one, name: "trace-1" },
          { completion_tokens: prop.two, name: "trace-2" },
        ]);
      } else {
        fail("Expected result to be an array of MyType");
      }
    });
  });
});

type MyType = {
  completion_tokens: bigint | Decimal;
  name: string;
};

function isMyType(value: unknown): value is MyType {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Partial<MyType>;

  const isBigIntOrDecimal = (x: unknown): x is bigint | Decimal => {
    // Assuming Decimal has a specific property or method to distinguish it, e.g., 'isDecimal'
    return (
      typeof x === "bigint" ||
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

function isArrayOfMyType(value: unknown): value is MyType[] {
  return Array.isArray(value) && value.every(isMyType);
}
