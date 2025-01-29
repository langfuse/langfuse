import { orderByToPrismaSql } from "@langfuse/shared/src/server";
import { tracesTableCols } from "@langfuse/shared";

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
});
