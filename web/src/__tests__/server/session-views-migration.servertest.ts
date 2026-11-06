import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { onTestFinished } from "vitest";
import { Role } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

it("leaves legacy presets untouched and initializes only default Messages pins", async () => {
  const schema = `session_view_migration_${randomUUID().replaceAll("-", "")}`;
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  onTestFinished(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    await tx.$executeRawUnsafe(
      `CREATE TYPE "Role" AS ENUM (${Object.values(Role)
        .map((role) => `'${role}'`)
        .join(", ")})`,
    );
    await tx.$executeRawUnsafe(
      "CREATE TABLE projects (id TEXT PRIMARY KEY, org_id TEXT NOT NULL)",
    );
    await tx.$executeRawUnsafe("CREATE TABLE users (id TEXT PRIMARY KEY)");
    await tx.$executeRawUnsafe(`CREATE TABLE organization_memberships (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL, user_id TEXT NOT NULL, role "Role" NOT NULL
    )`);
    await tx.$executeRawUnsafe(`CREATE TABLE project_memberships (
      project_id TEXT NOT NULL, user_id TEXT NOT NULL, org_membership_id TEXT NOT NULL, role "Role" NOT NULL,
      PRIMARY KEY (project_id, user_id)
    )`);
    await tx.$executeRawUnsafe(`CREATE TABLE table_view_presets (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, table_name TEXT NOT NULL,
      filters JSONB NOT NULL, created_by TEXT, created_at TIMESTAMP(3) NOT NULL, updated_at TIMESTAMP(3) NOT NULL
    )`);
    await tx.$executeRaw`INSERT INTO projects VALUES ('project', 'org')`;
    await tx.$executeRaw`INSERT INTO users VALUES ('creator')`;
    await tx.$executeRaw`INSERT INTO organization_memberships VALUES ('membership', 'org', 'creator', 'ADMIN')`;
    await tx.$executeRaw`INSERT INTO table_view_presets VALUES
      ('saved-session', 'project', 'Errors', 'session-detail', '[{"column":"level","type":"string","operator":"=","value":"ERROR"},{"column":"type","type":"stringOptions","operator":"any of","value":["GENERATION"]},{"column":"hasInput","type":"boolean","operator":"=","value":true},{"column":"latency","type":"number","operator":">","value":1},{"column":"positionInTrace","type":"positionInTrace","operator":"=","key":"root","value":1}]', 'creator', '2026-01-01', '2026-02-01'),
      ('unowned-session', 'project', 'Unowned', 'session-detail', '[]', NULL, '2026-01-01', '2026-02-01'),
      ('other-table', 'project', 'Traces', 'traces', '[]', 'creator', '2026-01-01', '2026-02-01')`;
    const legacyPresets =
      await tx.$queryRaw`SELECT * FROM table_view_presets ORDER BY id`;
    const migration = readFileSync(
      new URL(
        "../../../../packages/shared/prisma/migrations/20261105120000_add_session_views/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    // One DO statement preserves semicolons inside the migration's function bodies.
    await tx.$executeRawUnsafe(
      `DO $migration$ BEGIN\n${migration}\nEND $migration$;`,
    );
    await expect(tx.$queryRaw`SELECT * FROM session_views`).resolves.toEqual(
      [],
    );
    await expect(
      tx.$queryRaw`SELECT project_id, user_id, builtin_view, position FROM session_view_pins`,
    ).resolves.toEqual([
      {
        project_id: "project",
        user_id: "creator",
        builtin_view: "messages",
        position: -1,
      },
    ]);
    await tx.$executeRaw`INSERT INTO projects VALUES ('new-project', 'org')`;
    await tx.$executeRaw`INSERT INTO users VALUES ('new-member')`;
    await tx.$executeRaw`INSERT INTO organization_memberships VALUES ('new-membership', 'org', 'new-member', 'NONE')`;
    await tx.$executeRaw`INSERT INTO project_memberships VALUES ('project', 'new-member', 'new-membership', 'VIEWER')`;
    await tx.$executeRaw`UPDATE organization_memberships SET role = 'VIEWER' WHERE id = 'new-membership'`;
    await expect(
      tx.$queryRaw`SELECT project_id, user_id FROM session_view_pins ORDER BY project_id, user_id`,
    ).resolves.toEqual([
      { project_id: "new-project", user_id: "creator" },
      { project_id: "new-project", user_id: "new-member" },
      { project_id: "project", user_id: "creator" },
      { project_id: "project", user_id: "new-member" },
    ]);
    await expect(
      tx.$queryRaw`SELECT * FROM table_view_presets ORDER BY id`,
    ).resolves.toEqual(legacyPresets);
  });
});
