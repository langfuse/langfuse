import { orderByToPrismaSql } from "@langfuse/shared/src/server";
import { normalizeOrderByForTable, tracesTableCols } from "@langfuse/shared";
import { tracesTableUiColumnDefinitions } from "@langfuse/shared/src/server";
import { orderByToClickhouseSql } from "../../../../packages/shared/src/server/queries/clickhouse-sql/orderby-factory";

// The test for the orderByToPrisma function
describe("orderByToPrisma (Convert orderBy to Prisma.sql)", () => {
  test("orderByToPrisma throws error for orderBy column not included in column defs", () => {
    expect(() =>
      orderByToPrismaSql(
        {
          column: "InvalidCol",
          order: "ASC",
        },
        tracesTableCols,
      ),
    ).toThrow(/Invalid filter column: InvalidCol/);
  });

  test("orderByToPrisma throws error for orderBy order that is not valid", () => {
    expect(() =>
      orderByToPrismaSql(
        {
          column: "latency",
          order: "test" as "ASC" | "DESC",
        },
        tracesTableCols,
      ),
    ).toThrow(/Invalid order: test/);
  });

  test("normalizeOrderByForTable maps leaked time aliases to expected table column", () => {
    expect(
      normalizeOrderByForTable({
        orderBy: { column: "startTime", order: "DESC" },
        expectedTimeColumn: "timestamp",
      }),
    ).toEqual({ column: "timestamp", order: "DESC" });

    expect(
      normalizeOrderByForTable({
        orderBy: { column: "timestamp", order: "ASC" },
        expectedTimeColumn: "createdAt",
      }),
    ).toEqual({ column: "createdAt", order: "ASC" });
  });

  test("orderByToClickhouseSql throws InvalidRequestError for invalid columns", () => {
    expect(() =>
      orderByToClickhouseSql(
        { column: "not_a_column", order: "ASC" },
        tracesTableUiColumnDefinitions,
      ),
    ).toThrow("Invalid order by column: not_a_column");

    try {
      orderByToClickhouseSql(
        { column: "not_a_column", order: "ASC" },
        tracesTableUiColumnDefinitions,
      );
    } catch (error) {
      expect(error).toMatchObject({
        name: "InvalidRequestError",
        httpCode: 400,
      });
    }
  });
});
