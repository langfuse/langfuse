import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: "org" as "org" | "enforced" | "disabled",
  cloudRegion: undefined as string | undefined,
  licenseKey: undefined as string | undefined,
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
        if (prop === "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION")
          return mocks.cloudRegion;
        if (prop === "LANGFUSE_EE_LICENSE_KEY") return mocks.licenseKey;
        return Reflect.get(target, prop);
      },
    }),
  };
});

import { isAccessAuditLogEnabled } from "@/src/ee/features/access-audit-log/server/isAccessAuditLogEnabled";

describe("isAccessAuditLogEnabled", () => {
  beforeEach(() => {
    mocks.mode = "org";
    mocks.cloudRegion = undefined;
    mocks.licenseKey = undefined;
  });

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
});
