import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { type Plan, Role } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";
import { afterEach, describe, expect, it } from "vitest";

import { env } from "@/src/env.mjs";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

async function accessAuditLogEnabled(orgId: string) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { accessAuditLogEnabled: true },
  });
  return org.accessAuditLogEnabled;
}

async function setup({ role, plan }: { role: Role; plan: Plan }) {
  const orgId = uuidv4();
  const userId = uuidv4();
  await prisma.organization.create({
    data: { id: orgId, name: `Access audit log ${orgId.slice(0, 8)}` },
  });
  await prisma.user.create({
    data: {
      id: userId,
      email: `access-audit-${userId.slice(0, 8)}@test.com`,
      name: "Access Audit Test User",
    },
  });
  await prisma.organizationMembership.create({
    data: { userId, orgId, role },
  });

  const session: Session = {
    expires: "1",
    user: {
      id: userId,
      canCreateOrganizations: true,
      name: "Access Audit Test User",
      email: `access-audit-${userId.slice(0, 8)}@test.com`,
      organizations: [
        {
          id: orgId,
          name: "Access audit log",
          role,
          plan,
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          accessAuditLogEnabled: false,
          projects: [],
        },
      ],
      featureFlags: testFeatureFlags(),
      admin: false,
    },
    environment: {} as any,
  };
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return { orgId, caller: appRouter.createCaller({ ...ctx, prisma }) };
}

describe("accessAuditLog.setEnabled", () => {
  const originalMode = env.LANGFUSE_AUDIT_LOG_ACCESS_EVENTS;

  afterEach(() => {
    (env as any).LANGFUSE_AUDIT_LOG_ACCESS_EVENTS = originalMode;
  });

  it("stores the opt-in and records a change event for that field only", async () => {
    (env as any).LANGFUSE_AUDIT_LOG_ACCESS_EVENTS = "org";
    const { caller, orgId } = await setup({
      role: Role.OWNER,
      plan: "cloud:enterprise",
    });

    await caller.accessAuditLog.setEnabled({ orgId, enabled: true });

    expect(await accessAuditLogEnabled(orgId)).toBe(true);
    const changeEvent = await prisma.auditLog.findFirstOrThrow({
      where: { orgId, resourceType: "organization", resourceId: orgId },
      select: { action: true, before: true, after: true },
    });
    expect(changeEvent.action).toBe("update");
    expect(JSON.parse(changeEvent.before!)).toEqual({
      accessAuditLogEnabled: false,
    });
    expect(JSON.parse(changeEvent.after!)).toEqual({
      accessAuditLogEnabled: true,
    });
  });

  it.each(["enforced", "disabled"] as const)(
    "rejects changes when the instance sets the mode to %s",
    async (mode) => {
      (env as any).LANGFUSE_AUDIT_LOG_ACCESS_EVENTS = mode;
      const { caller, orgId } = await setup({
        role: Role.OWNER,
        plan: "cloud:enterprise",
      });

      await expect(
        caller.accessAuditLog.setEnabled({ orgId, enabled: true }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(await accessAuditLogEnabled(orgId)).toBe(false);
    },
  );

  it("rejects organizations without the audit-logs entitlement", async () => {
    (env as any).LANGFUSE_AUDIT_LOG_ACCESS_EVENTS = "org";
    const { caller, orgId } = await setup({
      role: Role.OWNER,
      plan: "cloud:hobby",
    });

    await expect(
      caller.accessAuditLog.setEnabled({ orgId, enabled: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await accessAuditLogEnabled(orgId)).toBe(false);
  });

  it("rejects members without organization:update", async () => {
    (env as any).LANGFUSE_AUDIT_LOG_ACCESS_EVENTS = "org";
    const { caller, orgId } = await setup({
      role: Role.MEMBER,
      plan: "cloud:enterprise",
    });

    await expect(
      caller.accessAuditLog.setEnabled({ orgId, enabled: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await accessAuditLogEnabled(orgId)).toBe(false);
  });
});
