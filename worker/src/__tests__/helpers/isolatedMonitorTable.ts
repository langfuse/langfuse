import { v4 } from "uuid";
import { PrismaClient } from "@prisma/client";
import { prisma as sharedPrisma } from "@langfuse/shared/src/db";

/** createIsolatedMonitorTable keeps scheduler reads and writes separate from parallel test fixtures. */
export async function createIsolatedMonitorTable(): Promise<{
  db: PrismaClient;
  cleanup: () => Promise<void>;
}> {
  const schema = `monitor_test_${v4().replaceAll("-", "")}`;
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schema);
  // Keep the search path on the same connection for every test query.
  url.searchParams.set("connection_limit", "1");
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  const cleanup = async () => {
    await db.$disconnect();
    await sharedPrisma.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
    );
  };
  try {
    await sharedPrisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await db.$executeRawUnsafe(`SET search_path TO "${schema}", public`);
    await db.$executeRawUnsafe(
      "CREATE TABLE monitors (LIKE public.monitors INCLUDING ALL)",
    );
    // Prisma qualifies enum parameters with the datasource schema.
    for (const [column, enumName] of [
      ["view", "MonitorView"],
      ["status", "MonitorStatus"],
      ["severity", "MonitorSeverity"],
      ["threshold_operator", "MonitorThresholdOperator"],
    ]) {
      const [definition] = await sharedPrisma.$queryRawUnsafe<
        Array<{ labels: string; defaultExpression: string | null }>
      >(`
        SELECT
          (SELECT string_agg(quote_literal(enumlabel), ', ' ORDER BY enumsortorder)
           FROM pg_enum WHERE enumtypid = 'public."${enumName}"'::regtype) AS labels,
          (SELECT pg_get_expr(adbin, adrelid)
           FROM pg_attrdef JOIN pg_attribute
             ON adrelid = attrelid AND adnum = attnum
           WHERE adrelid = 'public.monitors'::regclass
             AND attname = '${column}') AS "defaultExpression"
      `);
      await db.$executeRawUnsafe(
        `CREATE TYPE "${schema}"."${enumName}" AS ENUM (${definition.labels})`,
      );
      await db.$executeRawUnsafe(
        `ALTER TABLE monitors ALTER COLUMN "${column}" DROP DEFAULT`,
      );
      await db.$executeRawUnsafe(
        `ALTER TABLE monitors ALTER COLUMN "${column}" TYPE "${schema}"."${enumName}" USING "${column}"::text::"${schema}"."${enumName}"`,
      );
      if (definition.defaultExpression) {
        await db.$executeRawUnsafe(
          `ALTER TABLE monitors ALTER COLUMN "${column}" SET DEFAULT (${definition.defaultExpression})::text::"${schema}"."${enumName}"`,
        );
      }
    }
    return { db, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
