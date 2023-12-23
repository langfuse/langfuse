import { orderByToPrismaSql } from "@/src/features/orderBy/server/orderByToPrisma";
import { tracesTableCols } from "@/src/server/api/definitions/tracesTable";
import { Prisma } from "@prisma/client";

// The test for the orderByToPrisma function
describe("orderByToPrisma (Convert orderBy to Prisma.sql)", () => {
  test("orderByToPrisma returns default sql when orderBy=null", () => {
    expect(orderByToPrismaSql(null, tracesTableCols)).toStrictEqual(
      Prisma.sql`ORDER BY t.timestamp DESC`,
    );
  });

  test("orderByToPrisma returns correct clause for orderBy column included in column defs", () => {
    expect(
      orderByToPrismaSql(
        {
          column: "latency",
          order: "ASC",
        },
        tracesTableCols,
      ),
    ).toStrictEqual(Prisma.sql`ORDER BY tl.latency ASC`);
  });

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
});
