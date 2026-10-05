import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAuditLogEnabled: vi.fn(() => true),
}));

vi.mock("@/src/features/audit-logs/isAuditLogEnabled", () => ({
  isAuditLogEnabled: mocks.isAuditLogEnabled,
}));

import { auditLog } from "@/src/features/audit-logs/server";
import { prisma } from "@langfuse/shared/src/db";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";

/**
 * Audit logs are an enterprise feature, so the write path is gated on the
 * instance holding a license that includes the `audit-logs` entitlement. These
 * tests cover the wiring — that `auditLog()` honours the gate for every actor
 * shape. The gate's own env/plan/entitlement logic is covered by
 * `unit/auditLogLicenseGate.servertest.ts`.
 */
describe("audit log license gate", () => {
  beforeEach(() => {
    mocks.isAuditLogEnabled.mockReturnValue(true);
  });

  const countRecords = (resourceId: string) =>
    prisma.auditLog.count({ where: { resourceId } });

  it("writes no record for any actor shape when audit logs are not licensed", async () => {
    const { orgId, projectId } = await createOrgProjectAndApiKey();
    const apiKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      scope: "PROJECT",
      note: "License gate test key",
    });
    const userId = randomUUID();

    mocks.isAuditLogEnabled.mockReturnValue(false);

    const apiKeyResourceId = randomUUID();
    await auditLog({
      action: "create",
      resourceType: "job",
      resourceId: apiKeyResourceId,
      orgId,
      projectId,
      apiKeyId: apiKey.id,
    });

    const sessionResourceId = randomUUID();
    await auditLog({
      action: "update",
      resourceType: "job",
      resourceId: sessionResourceId,
      session: { user: { id: userId }, orgId, projectId },
    });

    const userResourceId = randomUUID();
    await auditLog({
      action: "delete",
      resourceType: "job",
      resourceId: userResourceId,
      userId,
      orgId,
      projectId,
    });

    expect(await countRecords(apiKeyResourceId)).toBe(0);
    expect(await countRecords(sessionResourceId)).toBe(0);
    expect(await countRecords(userResourceId)).toBe(0);
  });

  it("writes a record for every actor shape when audit logs are licensed", async () => {
    const { orgId, projectId } = await createOrgProjectAndApiKey();
    const apiKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      scope: "PROJECT",
      note: "License gate test key",
    });
    const userId = randomUUID();

    const apiKeyResourceId = randomUUID();
    await auditLog({
      action: "create",
      resourceType: "job",
      resourceId: apiKeyResourceId,
      orgId,
      projectId,
      apiKeyId: apiKey.id,
    });

    const sessionResourceId = randomUUID();
    await auditLog({
      action: "update",
      resourceType: "job",
      resourceId: sessionResourceId,
      session: { user: { id: userId }, orgId, projectId },
    });

    const userResourceId = randomUUID();
    await auditLog({
      action: "delete",
      resourceType: "job",
      resourceId: userResourceId,
      userId,
      orgId,
      projectId,
    });

    expect(await countRecords(apiKeyResourceId)).toBe(1);
    expect(await countRecords(sessionResourceId)).toBe(1);
    expect(await countRecords(userResourceId)).toBe(1);
  });
});
