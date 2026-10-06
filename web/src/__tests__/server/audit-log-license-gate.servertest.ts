import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cloudRegion: undefined as string | undefined,
  licenseKey: undefined as string | undefined,
  logDeletionActors: "false" as "true" | "false",
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
        return Reflect.get(target, prop);
      },
    }),
  };
});

vi.mock("@langfuse/shared/src/env", async (importOriginal) => {
  const original = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...original,
    env: new Proxy(original.env, {
      get: (target, prop) => {
        if (prop === "LANGFUSE_LOG_DELETION_ACTORS")
          return mocks.logDeletionActors;
        return Reflect.get(target, prop);
      },
    }),
  };
});

import { auditLog } from "@/src/features/audit-logs/server";
import { prisma } from "@langfuse/shared/src/db";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";
import { createOrgProjectAndApiKey, logger } from "@langfuse/shared/src/server";

/**
 * Audit log records are an enterprise feature, so they are only persisted when
 * the instance is licensed for them. The actor log line that mirrors each
 * record is operator telemetry and stays on every plan.
 */
describe("audit log license gate", () => {
  let orgId: string;
  let projectId: string;
  let apiKeyId: string;
  const userId = randomUUID();

  beforeEach(async () => {
    mocks.cloudRegion = undefined;
    mocks.licenseKey = undefined;
    mocks.logDeletionActors = "false";

    const org = await createOrgProjectAndApiKey();
    orgId = org.orgId;
    projectId = org.projectId;
    apiKeyId = (
      await createAndAddApiKeysToDb({
        prisma,
        entityId: org.projectId,
        scope: "PROJECT",
        note: "License gate test key",
      })
    ).id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Writes one record per actor shape, returns how many were persisted. */
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

    return prisma.auditLog.count({
      where: { resourceId: { in: resourceIds } },
    });
  };

  describe("self-hosted", () => {
    it("persists records with an enterprise license key", async () => {
      mocks.licenseKey = "langfuse_ee_test";

      expect(await auditAllActorShapes()).toBe(3);
    });

    it("persists no records without a license key", async () => {
      expect(await auditAllActorShapes()).toBe(0);
    });

    it("persists no records on a pro license key", async () => {
      // self-hosted:pro does not carry the audit-logs entitlement, so it must
      // not persist records it cannot view either.
      mocks.licenseKey = "langfuse_pro_test";

      expect(await auditAllActorShapes()).toBe(0);
    });
  });

  describe("cloud", () => {
    it("persists records on every plan", async () => {
      mocks.cloudRegion = "US";

      expect(await auditAllActorShapes()).toBe(3);
    });
  });

  it("still logs actor info when records are not persisted", async () => {
    // The actor log line is operator telemetry, not the audited record: it
    // carries ids only (no before/after diff) and is the sole actor trail for
    // mutations that have no parallel logger call of their own.
    mocks.logDeletionActors = "true";
    const info = vi.spyOn(logger, "info");

    expect(await auditAllActorShapes()).toBe(0);

    const actorLines = info.mock.calls.filter(([message]) =>
      String(message).startsWith("Audit log: job."),
    );
    expect(actorLines).toHaveLength(3);
  });

  it("skips actor lines for deletes unless LANGFUSE_LOG_DELETION_ACTORS is enabled", async () => {
    const info = vi.spyOn(logger, "info");

    await auditAllActorShapes();

    const actorLines = info.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.startsWith("Audit log: job."));
    expect(actorLines).toHaveLength(2);
    expect(actorLines.some((m) => m.startsWith("Audit log: job.delete"))).toBe(
      false,
    );
  });
});
