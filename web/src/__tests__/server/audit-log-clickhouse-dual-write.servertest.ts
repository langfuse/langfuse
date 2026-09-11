import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  convertDateToClickhouseDateTime,
  createOrgProjectAndApiKey,
  QueueJobs,
} from "@langfuse/shared/src/server";

const mockAdd = vi.fn();

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const originalModule = await importOriginal<Record<string, unknown>>();
  return {
    ...originalModule,
    AuditLogQueue: {
      getInstance: vi.fn(() => ({ add: mockAdd })),
    },
  };
});

import { auditLog } from "@/src/features/audit-logs/auditLog";

describe("auditLog dual write", () => {
  beforeEach(() => {
    mockAdd.mockReset();
    mockAdd.mockResolvedValue(undefined);
  });

  it("queues the Postgres change row for ClickHouse with the same id and timestamp", async () => {
    const { orgId, projectId } = await createOrgProjectAndApiKey();
    const userId = randomUUID();
    const resourceId = randomUUID();

    await auditLog({
      session: {
        user: { id: userId },
        orgId,
        orgRole: "OWNER",
        projectId,
        projectRole: "ADMIN",
      },
      resourceType: "prompt",
      resourceId,
      action: "update",
      before: { name: "old" },
      after: { name: "new" },
    });

    const persisted = await prisma.auditLog.findFirstOrThrow({
      where: { orgId, resourceId },
    });

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(
      QueueJobs.AuditLogJob,
      expect.objectContaining({
        id: persisted.id,
        name: QueueJobs.AuditLogJob,
        payload: {
          id: persisted.id,
          timestamp: convertDateToClickhouseDateTime(persisted.createdAt),
          org_id: orgId,
          project_id: projectId,
          event_kind: "change",
          actor_type: "USER",
          user_id: userId,
          api_key_id: "",
          user_org_role: "OWNER",
          user_project_role: "ADMIN",
          resource_type: "prompt",
          resource_id: resourceId,
          action: "update",
          surface: "",
          route: "",
          params: "",
          result_count: 0,
          before: JSON.stringify({ name: "old" }),
          after: JSON.stringify({ name: "new" }),
        },
      }),
    );
  });

  it("keeps the Postgres row and does not fail the caller when the queue is down", async () => {
    const { orgId, projectId } = await createOrgProjectAndApiKey();
    const resourceId = randomUUID();
    mockAdd.mockRejectedValueOnce(new Error("redis down"));

    await expect(
      auditLog({
        userId: randomUUID(),
        orgId,
        projectId,
        resourceType: "dataset",
        resourceId,
        action: "delete",
      }),
    ).resolves.toBeUndefined();

    expect(mockAdd).toHaveBeenCalledTimes(1);
    await expect(
      prisma.auditLog.count({ where: { orgId, resourceId } }),
    ).resolves.toBe(1);
  });
});
