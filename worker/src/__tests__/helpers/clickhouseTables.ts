import type { TestContext } from "vitest";
import { queryClickhouse } from "@langfuse/shared/src/server";

export async function clickhouseTableExists(table: string): Promise<boolean> {
  try {
    const rows = await queryClickhouse<{ count: number | string }>({
      query: `
        SELECT count() AS count
        FROM system.tables
        WHERE database = currentDatabase()
          AND name = {table: String}
      `,
      params: { table },
    });

    return Number(rows[0]?.count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function skipUnlessClickhouseTablesExist(
  ctx: TestContext,
  tables: string[],
  message = "required ClickHouse tables are not enabled",
): Promise<void> {
  for (const table of tables) {
    if (!(await clickhouseTableExists(table))) {
      ctx.skip(message);
    }
  }
}
