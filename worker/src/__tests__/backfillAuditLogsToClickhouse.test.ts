import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  convertPostgresAuditLogToClickhouse,
  deriveAuditLogEventId,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import BackfillAuditLogsToClickhouse from "../backgroundMigrations/backfillAuditLogsToClickhouse";
import { insertAuditLogRecords } from "../features/audit-log-relay";

// Without FINAL, so a row inserted twice shows up twice.
const readClickhouseRows = (orgId: string) =>
  queryClickhouse<{
    id: string;
    project_id: string;
    event_kind: string;
    actor_type: string;
    user_id: string;
    api_key_id: string;
    actor_name: string;
    actor_email: string;
    user_org_role: string;
    user_project_role: string;
    resource_type: string;
    resource_id: string;
    action: string;
    before: string;
    after: string;
  }>({
    query: `
      SELECT id, project_id, event_kind, actor_type, user_id, api_key_id,
             actor_name, actor_email, user_org_role, user_project_role,
             resource_type, resource_id, action, before, after
      FROM audit_logs
      WHERE org_id = {orgId: String}
      ORDER BY timestamp ASC, id ASC
    `,
    params: { orgId },
  });

const readState = async (migrationId: string) =>
  (
    await prisma.backgroundMigration.findUniqueOrThrow({
      where: { id: migrationId },
      select: { state: true },
    })
  ).state as {
    cursorCreatedAt: string;
    cursorId: string;
    copiedRows: number;
    skippedRows: number;
  };

type PostgresAuditLogRow = Parameters<
  typeof convertPostgresAuditLogToClickhouse
>[0];

// Older than the default settle window, so the first run copies it.
const settledAt = (offsetMs: number) =>
  new Date(Date.now() - 10 * 60_000 + offsetMs);

describe("BackfillAuditLogsToClickhouse", () => {
  let migrationId: string;
  let orgId: string;
  let projectId: string;

  const postgresRow = (
    createdAt: Date,
    fields: Partial<PostgresAuditLogRow>,
  ): PostgresAuditLogRow => ({
    id: randomUUID(),
    createdAt,
    type: "USER",
    userId: null,
    apiKeyId: null,
    userOrgRole: null,
    userProjectRole: null,
    orgId,
    projectId,
    resourceType: "prompt",
    resourceId: randomUUID(),
    action: "update",
    before: null,
    after: null,
    ...fields,
  });

  beforeEach(async () => {
    migrationId = randomUUID();
    orgId = randomUUID();
    projectId = randomUUID();
    await prisma.backgroundMigration.create({
      data: {
        id: migrationId,
        name: `test_backfill_audit_logs_${migrationId}`,
        script: "backfillAuditLogsToClickhouse",
        args: {},
      },
    });
  });

  afterEach(async () => {
    await prisma.backgroundMigration.deleteMany({ where: { id: migrationId } });
    await prisma.auditLog.deleteMany({ where: { orgId } });
  });

  it("copies settled rows in cursor order, maps sentinel actors to SYSTEM and resumes from the cursor", async () => {
    const rows = [
      postgresRow(settledAt(0), {
        userId: "user-1",
        userOrgRole: "ADMIN",
        userProjectRole: "MEMBER",
        before: JSON.stringify({ name: "a" }),
        after: JSON.stringify({ name: "b" }),
      }),
      // An in-app agent key keeps the user it acts for.
      postgresRow(settledAt(1000), {
        type: "API_KEY",
        apiKeyId: "api-key-1",
        userId: "user-2",
      }),
      postgresRow(settledAt(2000), {
        userId: "stripe-webhook",
        projectId: null,
        resourceType: "organization",
      }),
      postgresRow(settledAt(3000), { type: "API_KEY", apiKeyId: "ADMIN_KEY" }),
    ];
    // Inside the settle window, so the first run stops short of it.
    const lateRow = postgresRow(new Date(), { userId: "user-3" });
    await prisma.auditLog.createMany({ data: [...rows, lateRow] });

    const migration = new BackfillAuditLogsToClickhouse(migrationId);
    await expect(migration.validate()).resolves.toEqual({
      valid: true,
      invalidReason: undefined,
    });
    await migration.run({ batchSize: 2 });

    const copied = await readClickhouseRows(orgId);
    expect(copied.map((row) => row.id)).toEqual(
      rows.map((row) => deriveAuditLogEventId(row.id, row.createdAt)),
    );
    expect(copied[0]).toMatchObject({
      project_id: projectId,
      event_kind: "change",
      actor_type: "USER",
      user_id: "user-1",
      api_key_id: "",
      actor_name: "",
      user_org_role: "ADMIN",
      user_project_role: "MEMBER",
      resource_type: "prompt",
      resource_id: rows[0].resourceId,
      action: "update",
      before: JSON.stringify({ name: "a" }),
      after: JSON.stringify({ name: "b" }),
    });
    expect(copied[1]).toMatchObject({
      actor_type: "API_KEY",
      api_key_id: "api-key-1",
      user_id: "user-2",
      before: "",
    });
    expect(copied[2]).toMatchObject({
      project_id: "",
      actor_type: "SYSTEM",
      actor_name: "stripe-webhook",
      user_id: "",
    });
    expect(copied[3]).toMatchObject({
      actor_type: "SYSTEM",
      actor_name: "admin-api",
      api_key_id: "",
    });

    // Other tests write audit logs concurrently, so the cursor is asserted
    // relative to this test's rows.
    const state = await readState(migrationId);
    const cursorAt = new Date(state.cursorCreatedAt).getTime();
    expect(cursorAt).toBeGreaterThanOrEqual(rows[3].createdAt.getTime());
    expect(cursorAt).toBeLessThan(lateRow.createdAt.getTime());

    // Once the late row has settled, a second run copies only what is new.
    await new BackfillAuditLogsToClickhouse(migrationId).run({
      batchSize: 2,
      settleMs: 0,
    });

    expect((await readClickhouseRows(orgId)).map((row) => row.id)).toEqual([
      ...copied.map((row) => row.id),
      deriveAuditLogEventId(lateRow.id, lateRow.createdAt),
    ]);
  });

  it("skips rows that are in ClickHouse already, so their actor name and email stay", async () => {
    const relayed = postgresRow(settledAt(0), { userId: "user-1" });
    const missing = postgresRow(settledAt(1000), { userId: "user-2" });
    await prisma.auditLog.createMany({ data: [relayed, missing] });
    // The row auditLog() staged for `relayed`, after the relay moved it.
    await insertAuditLogRecords(
      [
        {
          ...convertPostgresAuditLogToClickhouse(relayed),
          actor_name: "Ada Lovelace",
          actor_email: "ada@example.com",
        },
      ],
      AbortSignal.timeout(10_000),
    );

    await new BackfillAuditLogsToClickhouse(migrationId).run({});

    const copied = await readClickhouseRows(orgId);
    expect(copied).toEqual([
      expect.objectContaining({
        id: deriveAuditLogEventId(relayed.id, relayed.createdAt),
        actor_name: "Ada Lovelace",
        actor_email: "ada@example.com",
      }),
      expect.objectContaining({
        id: deriveAuditLogEventId(missing.id, missing.createdAt),
        actor_name: "",
      }),
    ]);
    expect((await readState(migrationId)).skippedRows).toBeGreaterThanOrEqual(
      1,
    );
  });
});
