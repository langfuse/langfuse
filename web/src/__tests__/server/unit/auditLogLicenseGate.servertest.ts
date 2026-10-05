import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined as string | undefined,
    LANGFUSE_EE_LICENSE_KEY: undefined as string | undefined,
  },
}));

vi.mock("@/src/env.mjs", () => ({ env: mocks.env }));

import { isAuditLogEnabled } from "@/src/features/audit-logs/isAuditLogEnabled";

describe("isAuditLogEnabled", () => {
  beforeEach(() => {
    mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    mocks.env.LANGFUSE_EE_LICENSE_KEY = undefined;
  });

  describe("self-hosted", () => {
    it("writes records with an enterprise license key", () => {
      mocks.env.LANGFUSE_EE_LICENSE_KEY = "langfuse_ee_test";

      expect(isAuditLogEnabled()).toBe(true);
    });

    it("does not write records without a license key", () => {
      expect(isAuditLogEnabled()).toBe(false);
    });

    it("does not write records on a pro license key", () => {
      // self-hosted:pro does not carry the audit-logs entitlement, so it must
      // not write records it cannot view either.
      mocks.env.LANGFUSE_EE_LICENSE_KEY = "langfuse_pro_test";

      expect(isAuditLogEnabled()).toBe(false);
    });

    it("does not write records on an unrecognized license key", () => {
      mocks.env.LANGFUSE_EE_LICENSE_KEY = "not-a-langfuse-license-key";

      expect(isAuditLogEnabled()).toBe(false);
    });
  });

  describe("cloud", () => {
    it("writes records on every plan", () => {
      mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";

      expect(isAuditLogEnabled()).toBe(true);
    });

    it("writes records regardless of the self-hosted license key", () => {
      mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "EU";
      mocks.env.LANGFUSE_EE_LICENSE_KEY = "langfuse_pro_test";

      expect(isAuditLogEnabled()).toBe(true);
    });
  });
});
