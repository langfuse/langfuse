import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import { queryClickhouse } from "@langfuse/shared/src/server";
import BackfillAuditLogsToClickhouse from "../backgroundMigrations/backfillAuditLogsToClickhouse";

const readClickhouseRows = (orgId: string) =>
  queryClickhouse<{
    id: string;
    project_id: string;
    event_kind: string;
    actor_type: string;
    user_id: string;
    api_key_id: string;
    resource_type: string;
    action: string;
    before: string;
    after: string;
  }>({
    query: `
      SELECT id, project_id, event_kind, actor_type, user_id, api_key_id,
             resource_type, action, before, after
      FROM audit_logs FINAL
      WHERE org_id = {orgId: String}
      ORDER BY timestamp ASC, id ASC
    `,
    params: { orgId },
  });

const readState = (state: unknown) =>
  state as { cursorCreatedAt: string; cursorId: string; processedRows: number };

describe("BackfillAuditLogsToClickhouse", () => {
  let migrationId: string;
  let orgId: string;
  let projectId: string;

  beforeEach(async () => {
    migrationId = uuidv4();
    orgId = uuidv4();
    projectId = uuidv4();
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

  it("copies rows in batches, persists a resumable cursor and stays idempotent", async () => {
    const base = Date.now() - 60_000;
    const rows = [0, 1, 2].map((i) => ({
      id: `row-${i}-${uuidv4()}`,
      createdAt: new Date(base + i * 1000),
      orgId,
      projectId: i === 2 ? null : projectId,
      type: i === 1 ? ("API_KEY" as const) : ("USER" as const),
      userId: i === 1 ? null : `user-${i}`,
      apiKeyId: i === 1 ? "api-key-1" : null,
      resourceType: "prompt",
      resourceId: `prompt-${i}`,
      action: "update",
      before: i === 0 ? JSON.stringify({ name: "a" }) : null,
      after: JSON.stringify({ name: "b" }),
    }));
    await prisma.auditLog.createMany({ data: rows });

    const migration = new BackfillAuditLogsToClickhouse(migrationId);
    await expect(migration.validate()).resolves.toEqual({
      valid: true,
      invalidReason: undefined,
    });
    await migration.run({ batchSize: 2 });

    const copied = await readClickhouseRows(orgId);
    expect(copied.map((r) => r.id)).toEqual(rows.map((r) => r.id));
    expect(copied[0]).toMatchObject({
      project_id: projectId,
      event_kind: "change",
      actor_type: "USER",
      user_id: "user-0",
      api_key_id: "",
      resource_type: "prompt",
      action: "update",
      before: JSON.stringify({ name: "a" }),
      after: JSON.stringify({ name: "b" }),
    });
    expect(copied[1]).toMatchObject({
      actor_type: "API_KEY",
      user_id: "",
      api_key_id: "api-key-1",
      before: "",
    });
    expect(copied[2].project_id).toBe("");

    // Other tests write audit logs concurrently, so the cursor is asserted
    // relative to our rows rather than as an exact value.
    const state = readState(
      (
        await prisma.backgroundMigration.findUniqueOrThrow({
          where: { id: migrationId },
          select: { state: true },
        })
      ).state,
    );
    expect(new Date(state.cursorCreatedAt).getTime()).toBeGreaterThanOrEqual(
      rows[2].createdAt.getTime(),
    );
    expect(state.processedRows).toBeGreaterThanOrEqual(3);

    // A later row appears after the cursor: a re-run copies only that one and
    // re-inserting nothing else keeps the row count stable.
    const lateRow = {
      id: `row-late-${uuidv4()}`,
      createdAt: new Date(),
      orgId,
      projectId,
      type: "USER" as const,
      userId: "user-late",
      apiKeyId: null,
      resourceType: "prompt",
      resourceId: "prompt-late",
      action: "delete",
      before: null,
      after: null,
    };
    await prisma.auditLog.create({ data: lateRow });

    await new BackfillAuditLogsToClickhouse(migrationId).run({ batchSize: 2 });

    const afterRerun = await readClickhouseRows(orgId);
    expect(afterRerun.map((r) => r.id)).toEqual([
      ...rows.map((r) => r.id),
      lateRow.id,
    ]);
    const stateAfter = readState(
      (
        await prisma.backgroundMigration.findUniqueOrThrow({
          where: { id: migrationId },
          select: { state: true },
        })
      ).state,
    );
    expect(
      new Date(stateAfter.cursorCreatedAt).getTime(),
    ).toBeGreaterThanOrEqual(lateRow.createdAt.getTime());
    expect(stateAfter.processedRows).toBeGreaterThan(state.processedRows);
  });
});
