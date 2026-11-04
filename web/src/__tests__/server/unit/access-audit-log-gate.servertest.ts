import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: "org" as "org" | "enforced" | "disabled",
  stagingEnabled: "true",
  cloudRegion: undefined as string | undefined,
  licenseKey: undefined as string | undefined,
  findOrganization: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { organization: { findFirst: mocks.findOrganization } },
}));

// Override only the values the gate reads, so the real
// env -> plan -> entitlement chain runs.
vi.mock("@/src/env.mjs", async (importOriginal) => {
  const original = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...original,
    env: new Proxy(original.env, {
      get: (target, prop) => {
        if (prop === "LANGFUSE_AUDIT_LOG_ACCESS_EVENTS") return mocks.mode;
        if (prop === "LANGFUSE_AUDIT_LOG_STAGING_ENABLED")
          return mocks.stagingEnabled;
        if (prop === "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION")
          return mocks.cloudRegion;
        if (prop === "LANGFUSE_EE_LICENSE_KEY") return mocks.licenseKey;
        return Reflect.get(target, prop);
      },
    }),
  };
});

import { isAccessAuditLogEnabled } from "@/src/features/audit-logs/isAccessAuditLogEnabled";
import { recordTrpcAccess } from "@/src/features/audit-logs/server/recordAccessEvent";

beforeEach(() => {
  mocks.mode = "org";
  mocks.stagingEnabled = "true";
  mocks.cloudRegion = undefined;
  mocks.licenseKey = undefined;
  mocks.findOrganization.mockReset().mockResolvedValue(null);
});

describe("isAccessAuditLogEnabled", () => {
  it("records nothing when disabled", () => {
    mocks.mode = "disabled";
    mocks.cloudRegion = "EU";
    expect(
      isAccessAuditLogEnabled({
        plan: "cloud:enterprise",
        accessAuditLogEnabled: true,
      }),
    ).toBe(false);
  });

  it("records nothing while the staging kill switch is off, even when enforced", () => {
    mocks.mode = "enforced";
    mocks.stagingEnabled = "false";
    mocks.cloudRegion = "EU";
    expect(
      isAccessAuditLogEnabled({
        plan: "cloud:enterprise",
        accessAuditLogEnabled: true,
      }),
    ).toBe(false);
  });

  it("records every plan on Langfuse Cloud when enforced", () => {
    mocks.mode = "enforced";
    mocks.cloudRegion = "EU";
    expect(
      isAccessAuditLogEnabled({
        plan: "cloud:hobby",
        accessAuditLogEnabled: false,
      }),
    ).toBe(true);
  });

  it.each([
    [undefined, false],
    ["langfuse_pro_key", false],
    ["langfuse_ee_key", true],
  ])(
    "records a self-hosted instance with license %s when enforced: %s",
    (licenseKey, expected) => {
      mocks.mode = "enforced";
      mocks.licenseKey = licenseKey;
      expect(
        isAccessAuditLogEnabled({ plan: "oss", accessAuditLogEnabled: false }),
      ).toBe(expected);
    },
  );

  it.each([
    ["cloud:enterprise", true, true],
    ["cloud:enterprise", false, false],
    ["cloud:pro", true, false],
  ] as const)(
    "records an org on %s with opt-in %s in org mode: %s",
    (plan, accessAuditLogEnabled, expected) => {
      mocks.cloudRegion = "EU";
      expect(isAccessAuditLogEnabled({ plan, accessAuditLogEnabled })).toBe(
        expected,
      );
    },
  );

  it.each([
    [true, true],
    [false, false],
  ])(
    "records a read with support access %s while access logging is disabled: %s",
    (supportAccess, expected) => {
      mocks.mode = "disabled";
      mocks.cloudRegion = "EU";
      expect(
        isAccessAuditLogEnabled(
          { plan: "cloud:hobby", accessAuditLogEnabled: false },
          { supportAccess },
        ),
      ).toBe(expected);
    },
  );

  it("records no support access read while the staging kill switch is off", () => {
    mocks.stagingEnabled = "false";
    mocks.cloudRegion = "EU";
    expect(
      isAccessAuditLogEnabled(
        { plan: "cloud:enterprise", accessAuditLogEnabled: true },
        { supportAccess: true },
      ),
    ).toBe(false);
  });
});

describe("recordTrpcAccess", () => {
  // Admins and viewers of public resources read projects their session does
  // not list, so the gate has to load the org.
  const nonMember = {
    session: {
      user: { id: "user", organizations: [] } as unknown as Session["user"],
    },
    headers: {},
  };
  const read = {
    route: "events.byTraceId",
    resourceType: "trace",
    action: "read",
    resourceRefs: [],
  };

  it.each([
    ["the staging kill switch is off", () => (mocks.stagingEnabled = "false")],
    ["access events are disabled", () => (mocks.mode = "disabled")],
    [
      "access events are enforced without a license",
      () => (mocks.mode = "enforced"),
    ],
  ])("loads no org for a non-member's read when %s", async (_, setUp) => {
    setUp();
    await recordTrpcAccess(nonMember, "project", read);
    expect(mocks.findOrganization).not.toHaveBeenCalled();
  });

  it("loads the org for a non-member's read in org mode", async () => {
    await recordTrpcAccess(nonMember, "project", read);
    expect(mocks.findOrganization).toHaveBeenCalledOnce();
  });
});
