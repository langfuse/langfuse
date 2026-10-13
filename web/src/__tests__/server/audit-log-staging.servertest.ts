import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { toAuditLogResourceRef } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  clickhouseClient,
  convertAuditLogStagingRowToClickhouse,
  stageAuditLogEvents,
  type AuditLogRecordInsertType,
} from "@langfuse/shared/src/server";

const queryAuditLogs = async (
  query: string,
  query_params: Record<string, string>,
) => {
  const result = await clickhouseClient().query({
    query,
    query_params,
    format: "JSONEachRow",
  });
  return result.json<Record<string, unknown>>();
};

describe("audit log staging", () => {
  const stagedIds: string[] = [];

  afterAll(async () => {
    await prisma.auditLogStaging.deleteMany({
      where: { id: { in: stagedIds } },
    });
  });

  it("stores staged events as audit_logs rows that resolve by resource ref", async () => {
    const orgId = randomUUID();
    const changeId = randomUUID();
    const traceRef = toAuditLogResourceRef("trace", randomUUID());

    const ids = await prisma.$transaction((tx) =>
      stageAuditLogEvents(
        [
          {
            id: changeId,
            kind: "change",
            orgId,
            projectId: "project-1",
            actor: {
              type: "USER",
              userId: "user-1",
              name: "Ada Lovelace",
              email: "ada@example.com",
              orgRole: "ADMIN",
              projectRole: "OWNER",
            },
            resourceType: "prompt",
            resourceId: "prompt-1",
            action: "update",
            before: { version: 1 },
            after: { version: 2 },
            surface: "trpc",
            route: "prompts.update",
            request: { ip: "203.0.113.7", userAgent: "curl/8.7.1" },
          },
          {
            kind: "access",
            orgId,
            projectId: "project-1",
            actor: { type: "API_KEY", apiKeyId: "api-key-1" },
            resourceType: "observation",
            action: "list",
            resourceRefs: [
              toAuditLogResourceRef("observation", "observation-1"),
              traceRef,
            ],
            params: { limit: 50 },
            resultCount: 1,
            surface: "public-api",
            route: "/api/public/v2/observations",
          },
          {
            kind: "access",
            orgId,
            actor: { type: "SYSTEM", name: "blob-storage-export" },
            resourceType: "trace",
            action: "export",
            outcome: "denied",
            outcomeReason: "project not found",
          },
        ],
        tx,
      ),
    );
    stagedIds.push(...ids);
    expect(ids[0]).toBe(changeId);

    const staged = await prisma.auditLogStaging.findMany({
      where: { id: { in: ids } },
    });
    const rows = ids.map((id) =>
      convertAuditLogStagingRowToClickhouse(
        staged.find((row) => row.id === id)!,
      ),
    );

    expect(rows[0]).toMatchObject({
      event_kind: "change",
      actor_type: "USER",
      user_id: "user-1",
      api_key_id: "",
      actor_name: "Ada Lovelace",
      actor_email: "ada@example.com",
      user_org_role: "ADMIN",
      user_project_role: "OWNER",
      before: '{"version":1}',
      after: '{"version":2}',
      params: "",
      ip: "203.0.113.7",
    });
    expect(rows[1]).toMatchObject({
      event_kind: "access",
      outcome: "success",
      actor_type: "API_KEY",
      user_id: "",
      api_key_id: "api-key-1",
      params: '{"limit":50}',
      result_count: 1,
      before: "",
    });
    expect(rows[2]).toMatchObject({
      project_id: "",
      outcome: "denied",
      outcome_reason: "project not found",
      actor_type: "SYSTEM",
      actor_name: "blob-storage-export",
      user_id: "",
      api_key_id: "",
      resource_refs: [],
    });

    await clickhouseClient().insert({
      table: "audit_logs",
      values: rows,
      format: "JSONEachRow",
    });

    const stored = await queryAuditLogs(
      "SELECT * EXCEPT inserted_at FROM audit_logs WHERE org_id = {orgId: String}",
      { orgId },
    );
    const byId = (a: Record<string, unknown>, b: Record<string, unknown>) =>
      String(a.id).localeCompare(String(b.id));
    expect(stored.sort(byId)).toEqual(
      [...rows].sort(byId) satisfies AuditLogRecordInsertType[],
    );

    const accessedTrace = await queryAuditLogs(
      "SELECT id FROM audit_logs WHERE org_id = {orgId: String} AND has(resource_refs, {ref: String})",
      { orgId, ref: traceRef },
    );
    expect(accessedTrace).toEqual([{ id: ids[1] }]);
  });

  it("discards staged rows when the caller's transaction rolls back", async () => {
    const id = randomUUID();

    await expect(
      prisma.$transaction(async (tx) => {
        await stageAuditLogEvents(
          [
            {
              id,
              kind: "change",
              orgId: randomUUID(),
              actor: { type: "USER", userId: "user-1" },
              resourceType: "prompt",
              resourceId: "prompt-1",
              action: "delete",
            },
          ],
          tx,
        );
        throw new Error("audited mutation failed");
      }),
    ).rejects.toThrow("audited mutation failed");

    expect(
      await prisma.auditLogStaging.findUnique({ where: { id } }),
    ).toBeNull();
  });

  it("stages ids holding characters that jsonb cannot store", async () => {
    const [id] = await stageAuditLogEvents([
      {
        kind: "access",
        orgId: randomUUID(),
        actor: { type: "API_KEY", apiKeyId: "api-key-1" },
        resourceType: "trace",
        resourceId: "trace-\u0000-1",
        resourceRefs: [toAuditLogResourceRef("trace", "trace-\uD800-1")],
        action: "read",
      },
    ]);
    stagedIds.push(id);

    const row = await prisma.auditLogStaging.findUniqueOrThrow({
      where: { id },
    });
    expect(convertAuditLogStagingRowToClickhouse(row)).toMatchObject({
      resource_id: "trace-�-1",
      resource_refs: ["trace:trace-�-1"],
    });
  });

  it("rejects staged payloads with fields it does not know", () => {
    // A newer web version may stage a field before this version maps it.
    expect(() =>
      convertAuditLogStagingRowToClickhouse({
        id: randomUUID(),
        createdAt: new Date(),
        payload: {
          kind: "change",
          orgId: randomUUID(),
          actor: { type: "USER", userId: "user-1", sessionId: "session-1" },
          resourceType: "prompt",
          resourceRefs: [],
          action: "delete",
          outcome: "success",
          dataSubject: "subject-1",
        },
      }),
    ).toThrow("actor.sessionId, dataSubject");
  });
});
