import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cloudRegion: undefined as string | undefined,
  licenseKey: undefined as string | undefined,
}));

// Spread the real env and override only the two values the gate reads, so the
// real plan resolution and entitlement lookup run underneath.
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

import { isAuditLogEnabled } from "@/src/features/audit-logs/isAuditLogEnabled";

describe("isAuditLogEnabled", () => {
  beforeEach(() => {
    mocks.cloudRegion = undefined;
    mocks.licenseKey = undefined;
  });

  describe("self-hosted", () => {
    it("persists records with an enterprise license key", () => {
      mocks.licenseKey = "langfuse_ee_test";

      expect(isAuditLogEnabled()).toBe(true);
    });

    it("persists no records without a license key", () => {
      expect(isAuditLogEnabled()).toBe(false);
    });

    it("persists no records on a pro license key", () => {
      // self-hosted:pro does not carry the audit-logs entitlement, so it must
      // not persist records it cannot view either.
      mocks.licenseKey = "langfuse_pro_test";

      expect(isAuditLogEnabled()).toBe(false);
    });

    it("persists no records on an unrecognized license key", () => {
      mocks.licenseKey = "not-a-langfuse-license-key";

      expect(isAuditLogEnabled()).toBe(false);
    });
  });

  describe("cloud", () => {
    it("persists records on every plan", () => {
      mocks.cloudRegion = "US";

      expect(isAuditLogEnabled()).toBe(true);
    });

    it("persists records regardless of the self-hosted license key", () => {
      mocks.cloudRegion = "EU";
      mocks.licenseKey = "langfuse_pro_test";

      expect(isAuditLogEnabled()).toBe(true);
    });
  });
});
