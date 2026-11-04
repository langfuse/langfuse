import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { onTestFinished } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { sessionTraceFilterSchema } from "@langfuse/shared";

it("migrates only session presets with List/Hide, preserving provenance and originals", async () => {
  const schema = `session_view_migration_${randomUUID().replaceAll("-", "")}`;
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  onTestFinished(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    await tx.$executeRawUnsafe("CREATE TABLE projects (id TEXT PRIMARY KEY)");
    await tx.$executeRawUnsafe("CREATE TABLE users (id TEXT PRIMARY KEY)");
    await tx.$executeRawUnsafe(`CREATE TABLE table_view_presets (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, table_name TEXT NOT NULL,
      filters JSONB NOT NULL, created_by TEXT, created_at TIMESTAMP(3) NOT NULL, updated_at TIMESTAMP(3) NOT NULL
    )`);
    await tx.$executeRaw`INSERT INTO projects VALUES ('project')`;
    await tx.$executeRaw`INSERT INTO users VALUES ('creator')`;
    await tx.$executeRaw`INSERT INTO table_view_presets VALUES
      ('saved-session', 'project', 'Errors', 'session-detail', '[{"column":"level","type":"string","operator":"=","value":"ERROR"},{"column":"type","type":"stringOptions","operator":"any of","value":["GENERATION"]},{"column":"hasInput","type":"boolean","operator":"=","value":true},{"column":"latency","type":"number","operator":">","value":1},{"column":"positionInTrace","type":"positionInTrace","operator":"=","key":"root","value":1}]', 'creator', '2026-01-01', '2026-02-01'),
      ('unowned-session', 'project', 'Unowned', 'session-detail', '[]', NULL, '2026-01-01', '2026-02-01'),
      ('other-table', 'project', 'Traces', 'traces', '[]', 'creator', '2026-01-01', '2026-02-01')`;
    const migration = readFileSync(
      new URL(
        "../../../../packages/shared/prisma/migrations/20261105120000_add_session_views/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const statement of migration
      .split(";")
      .filter((statement) => statement.trim())) {
      await tx.$executeRawUnsafe(statement);
    }
    const views = await tx.$queryRaw<
      {
        id: string;
        source_table_view_preset_id: string;
        view_mode: string;
        unmatched_traces: string;
        created_by: string | null;
        filters: unknown;
        created_at: Date;
        updated_at: Date;
      }[]
    >`SELECT * FROM session_views ORDER BY id`;
    expect(views).toEqual([
      expect.objectContaining({
        id: "saved-session",
        source_table_view_preset_id: "saved-session",
        view_mode: "list",
        unmatched_traces: "hide",
        created_by: "creator",
        filters: [
          { column: "level", type: "string", operator: "=", value: "ERROR" },
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["GENERATION"],
          },
          { column: "hasInput", type: "boolean", operator: "=", value: true },
          { column: "latency", type: "number", operator: ">", value: 1 },
          {
            column: "positionInTrace",
            type: "positionInTrace",
            operator: "=",
            key: "root",
            value: 1,
          },
        ],
        created_at: new Date("2026-01-01T00:00:00Z"),
        updated_at: new Date("2026-02-01T00:00:00Z"),
      }),
      expect.objectContaining({
        id: "unowned-session",
        source_table_view_preset_id: "unowned-session",
        view_mode: "list",
        unmatched_traces: "hide",
        created_by: null,
      }),
    ]);
    const migratedFilters = sessionTraceFilterSchema.parse(views[0]?.filters);
    expect(migratedFilters).toHaveLength(5);
    expect(migratedFilters.at(-1)).toEqual({
      column: "positionInTrace",
      type: "positionInTrace",
      operator: "=",
      key: "first",
      value: 1,
    });
    await expect(
      tx.$queryRaw`SELECT id FROM table_view_presets`,
    ).resolves.toHaveLength(3);
  });
});
