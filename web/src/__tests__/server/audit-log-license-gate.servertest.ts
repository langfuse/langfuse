import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cloudRegion: undefined as string | undefined,
  licenseKey: undefined as string | undefined,
  stagingEnabled: "true",
}));

// Exercise the real gate rather than mocking it away: spread the real env and
// override only the two values the gate reads, so the full
// env -> plan -> entitlement chain runs against a real database.
vi.mock("@/src/env.mjs", async (importOriginal) => {
  const original = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...original,
    env: new Proxy(original.env, {
      get: (target, prop) => {
        if (prop === "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION")
          return mocks.cloudRegion;
        if (prop === "LANGFUSE_EE_LICENSE_KEY") return mocks.licenseKey;
        if (prop === "LANGFUSE_AUDIT_LOG_STAGING_ENABLED")
          return mocks.stagingEnabled;
        return Reflect.get(target, prop);
      },
    }),
  };
});

import { auditLog } from "@/src/features/audit-logs/server";
import { prisma } from "@langfuse/shared/src/db";
import { createApiKey } from "@langfuse/shared/src/server/auth/apiKeys";
import {
  createOrgProjectAndApiKey,
  deriveAuditLogEventId,
  logger,
} from "@langfuse/shared/src/server";
import { ProjectId, SystemRoleId } from "@langfuse/shared/rbac";

/**
 * Audit log records are an enterprise feature, so they are only persisted when
 * the instance is licensed for them. They are staged for ClickHouse on Cloud
 * only, where the relay runs. The actor log line that mirrors each record is
 * operator telemetry and stays on every plan.
 */
describe("audit log license gate", () => {
  let orgId: string;
  let projectId: string;
  let apiKeyId: string;
  const userId = randomUUID();

  beforeEach(async () => {
    mocks.cloudRegion = undefined;
    mocks.licenseKey = undefined;
    mocks.stagingEnabled = "true";

    const org = await createOrgProjectAndApiKey();
    orgId = org.orgId;
    projectId = org.projectId;
    apiKeyId = (
      await createApiKey(prisma, {
        owner: ProjectId(org.projectId),
        role: SystemRoleId("LEGACY_PROJECT_API_KEY"),
        createdBy: "system",
        name: "License gate test key",
      })
    ).id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Writes one record per actor shape, counts the persisted and staged ones. */
  const auditAllActorShapes = async () => {
    const resourceIds = [randomUUID(), randomUUID(), randomUUID()];

    await auditLog({
      action: "create",
      resourceType: "job",
      resourceId: resourceIds[0],
      orgId,
      projectId,
      apiKeyId,
    });
    await auditLog({
      action: "update",
      resourceType: "job",
      resourceId: resourceIds[1],
      session: { user: { id: userId }, orgId, projectId },
    });
    await auditLog({
      action: "delete",
      resourceType: "job",
      resourceId: resourceIds[2],
      userId,
      orgId,
      projectId,
    });

    const records = await prisma.auditLog.findMany({
      where: { resourceId: { in: resourceIds } },
      select: { id: true, createdAt: true },
    });
    const stagedIds = records.map((record) =>
      deriveAuditLogEventId(record.id, record.createdAt),
    );
    const staged = await prisma.auditLogStaging.deleteMany({
      where: { id: { in: stagedIds } },
    });

    return { persisted: records.length, staged: staged.count };
  };

  describe("self-hosted", () => {
    it("persists records with an enterprise license key, without staging them", async () => {
      mocks.licenseKey = "langfuse_ee_test";

      expect(await auditAllActorShapes()).toEqual({ persisted: 3, staged: 0 });
    });

    it("persists no records without a license key", async () => {
      expect(await auditAllActorShapes()).toEqual({ persisted: 0, staged: 0 });
    });

    it("persists no records on a pro license key", async () => {
      // self-hosted:pro does not carry the audit-logs entitlement, so it must
      // not persist records it cannot view either.
      mocks.licenseKey = "langfuse_pro_test";

      expect(await auditAllActorShapes()).toEqual({ persisted: 0, staged: 0 });
    });
  });

  describe("cloud", () => {
    it("persists and stages records on every plan", async () => {
      mocks.cloudRegion = "US";

      expect(await auditAllActorShapes()).toEqual({ persisted: 3, staged: 3 });
    });

    it("persists records without staging them when staging is switched off", async () => {
      mocks.cloudRegion = "US";
      mocks.stagingEnabled = "false";

      expect(await auditAllActorShapes()).toEqual({ persisted: 3, staged: 0 });
    });
  });

  it("still logs actor info when records are not persisted", async () => {
    // The actor log line is operator telemetry, not the audited record: it
    // carries ids only (no before/after diff) and is the sole actor trail for
    // mutations that have no parallel logger call of their own.
    const info = vi.spyOn(logger, "info");

    expect((await auditAllActorShapes()).persisted).toBe(0);

    const actorLines = info.mock.calls.filter(([message]) =>
      String(message).startsWith("Audit log: job."),
    );
    expect(actorLines).toHaveLength(3);
  });
});
