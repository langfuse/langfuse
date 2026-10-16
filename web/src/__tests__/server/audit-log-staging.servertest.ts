import { randomUUID } from "node:crypto";
import { version as uuidVersion, validate as isUuid } from "uuid";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

// auditLog() stages its events on Cloud only.
vi.mock("@/src/env.mjs", async (importOriginal) => {
  const original = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...original,
    env: new Proxy(original.env, {
      get: (target, prop) =>
        prop === "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION"
          ? "US"
          : Reflect.get(target, prop),
    }),
  };
});

import { toAuditLogResourceRef, type AuditLogActor } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { ProjectId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import {
  clickhouseClient,
  convertAuditLogStagingRowToClickhouse,
  createOrgProjectAndApiKey,
  deriveAuditLogEventId,
  logger,
  stageAuditLogEvents,
  type AuditLogRecordInsertType,
} from "@langfuse/shared/src/server";
import { createApiKey } from "@langfuse/shared/src/server/auth/apiKeys";
import { auditLog } from "@/src/features/audit-logs/server";

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

  it("derives one time-ordered UUIDv7 per Postgres audit log row", () => {
    const createdAt = new Date("2026-10-14T09:30:00.123Z");
    const id = deriveAuditLogEventId("cm2abc0000000000000000001", createdAt);

    // Rows staged now and rows a later backfill copies from Postgres must get
    // the same id, so the derivation must never change.
    expect(id).toBe("01a139bf-4a3b-7791-9d80-a8821b47ea77");
    expect(isUuid(id) && uuidVersion(id)).toBe(7);
    expect(id.replaceAll("-", "").slice(0, 12)).toBe(
      createdAt.getTime().toString(16).padStart(12, "0"),
    );
    expect(deriveAuditLogEventId("cm2abc0000000000000000001", createdAt)).toBe(
      id,
    );
    expect(
      deriveAuditLogEventId("cm2abc0000000000000000002", createdAt),
    ).not.toBe(id);
    expect(
      deriveAuditLogEventId(
        "cm2abc0000000000000000001",
        new Date(createdAt.getTime() + 1),
      ) > id,
    ).toBe(true);
  });

  describe("auditLog shadow write", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** The Postgres row written for `resourceId` and the event staged for it. */
    const findRecordAndStagedEvent = async (resourceId: string) => {
      const record = await prisma.auditLog.findFirstOrThrow({
        where: { resourceId },
      });
      const id = deriveAuditLogEventId(record.id, record.createdAt);
      stagedIds.push(id);
      const staged = await prisma.auditLogStaging.findUniqueOrThrow({
        where: { id },
      });
      return { record, staged };
    };

    it("stages the change event of the Postgres row under the id derived from it", async () => {
      const { orgId, projectId } = await createOrgProjectAndApiKey();
      const resourceId = randomUUID();

      await auditLog({
        session: {
          user: {
            id: "user-1",
            name: "Ada Lovelace",
            email: "ada@example.com",
          },
          orgId,
          orgRole: "ADMIN",
          projectId,
          projectRole: "MEMBER",
        },
        resourceType: "prompt",
        resourceId,
        action: "update",
        before: { version: 1 },
        after: { version: 2 },
      });

      const { record, staged } = await findRecordAndStagedEvent(resourceId);
      expect(staged.createdAt).toEqual(record.createdAt);
      expect(record).toMatchObject({
        before: '{"version":1}',
        after: '{"version":2}',
      });
      expect(convertAuditLogStagingRowToClickhouse(staged)).toMatchObject({
        event_kind: "change",
        org_id: orgId,
        project_id: projectId,
        actor_type: "USER",
        user_id: "user-1",
        actor_name: "Ada Lovelace",
        actor_email: "ada@example.com",
        user_org_role: "ADMIN",
        user_project_role: "MEMBER",
        resource_type: "prompt",
        resource_id: resourceId,
        action: "update",
        before: record.before,
        after: record.after,
      });
    });

    it("stages SYSTEM, API key and in-app agent actors", async () => {
      const { orgId, projectId, publicKey } = await createOrgProjectAndApiKey();
      const { id: projectApiKeyId } = await prisma.apiKey.findUniqueOrThrow({
        where: { publicKey },
        select: { id: true },
      });
      const creator = await prisma.user.create({
        data: { email: `${randomUUID()}@test.com`, name: "Agent Owner" },
      });
      const agentKey = await createApiKey(prisma, {
        owner: ProjectId(projectId),
        role: SystemRoleId("LEGACY_PROJECT_API_KEY"),
        createdBy: UserId(creator.id),
        name: "In-app agent MCP session",
        isInAppAgentKey: true,
      });

      // Per actor: what the Postgres row keeps, and the actor staged for it.
      const cases: {
        actor:
          | { session: { user: { id: string }; orgId: string } }
          | { apiKeyId: string; orgId: string };
        record: { userId: string | null; apiKeyId: string | null };
        staged: AuditLogActor;
      }[] = [
        {
          actor: { session: { user: { id: "stripe-webhook" }, orgId } },
          record: { userId: "stripe-webhook", apiKeyId: null },
          staged: { type: "SYSTEM", name: "stripe-webhook" },
        },
        {
          actor: { apiKeyId: "ADMIN_KEY", orgId },
          record: { userId: null, apiKeyId: "ADMIN_KEY" },
          staged: { type: "SYSTEM", name: "admin-api" },
        },
        {
          actor: { apiKeyId: "ADMIN_API_KEY", orgId },
          record: { userId: null, apiKeyId: "ADMIN_API_KEY" },
          staged: { type: "SYSTEM", name: "admin-api" },
        },
        {
          actor: { apiKeyId: projectApiKeyId, orgId },
          record: { userId: null, apiKeyId: projectApiKeyId },
          staged: { type: "API_KEY", apiKeyId: projectApiKeyId },
        },
        {
          actor: { apiKeyId: agentKey.id, orgId },
          record: { userId: creator.id, apiKeyId: agentKey.id },
          staged: {
            type: "API_KEY",
            apiKeyId: agentKey.id,
            userId: creator.id,
            name: "Agent Owner",
            email: creator.email!,
          },
        },
      ];

      for (const { actor, ...expected } of cases) {
        const resourceId = randomUUID();
        await auditLog({
          ...actor,
          resourceType: "job",
          resourceId,
          action: "create",
        });

        const { record, staged } = await findRecordAndStagedEvent(resourceId);
        expect(record).toMatchObject(expected.record);
        expect((staged.payload as { actor: unknown }).actor).toEqual(
          expected.staged,
        );
      }
    });

    it("logs a failed staging insert without failing the caller", async () => {
      const { orgId } = await createOrgProjectAndApiKey();
      const resourceId = randomUUID();
      vi.spyOn(prisma.auditLogStaging, "createMany").mockRejectedValueOnce(
        new Error("staging unavailable"),
      );
      const error = vi.spyOn(logger, "error");

      await auditLog({
        session: { user: { id: "user-1" }, orgId },
        resourceType: "prompt",
        resourceId,
        action: "delete",
      });

      expect(error).toHaveBeenCalledWith(
        "Failed to stage audit log event",
        expect.objectContaining({ resourceId }),
      );
      expect(await prisma.auditLog.count({ where: { resourceId } })).toBe(1);
    });

    it("keeps the caller's transaction usable when the staging insert fails in it", async () => {
      const { orgId } = await createOrgProjectAndApiKey();
      const resourceId = randomUUID();
      const error = vi.spyOn(logger, "error");

      await prisma.$transaction(async (tx) => {
        // Fails the way a rejected insert does: Postgres aborts the
        // transaction.
        const stagingInsert = vi
          .spyOn(tx.auditLogStaging, "createMany")
          .mockImplementationOnce(() => tx.$queryRaw`SELECT 1 / 0`);

        await auditLog(
          {
            session: { user: { id: "user-1" }, orgId },
            resourceType: "prompt",
            resourceId,
            action: "delete",
          },
          tx,
        );

        expect(stagingInsert).toHaveBeenCalledOnce();
        expect(await tx.auditLog.count({ where: { resourceId } })).toBe(1);
      });

      expect(error).toHaveBeenCalledWith(
        "Failed to stage audit log event",
        expect.objectContaining({ resourceId }),
      );
      expect(await prisma.auditLog.count({ where: { resourceId } })).toBe(1);
    });

    it("stages nothing when the caller's transaction rolls back", async () => {
      const { orgId } = await createOrgProjectAndApiKey();
      const resourceId = randomUUID();

      await expect(
        prisma.$transaction(async (tx) => {
          await auditLog(
            {
              session: { user: { id: "user-1" }, orgId },
              resourceType: "prompt",
              resourceId,
              action: "delete",
            },
            tx,
          );
          throw new Error("audited mutation failed");
        }),
      ).rejects.toThrow("audited mutation failed");

      expect(
        await prisma.auditLogStaging.count({
          where: { payload: { path: ["resourceId"], equals: resourceId } },
        }),
      ).toBe(0);
    });
  });
});
