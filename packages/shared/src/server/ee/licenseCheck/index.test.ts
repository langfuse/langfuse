import { describe, expect, it } from "vitest";
import type { SharedEnv } from "../../../env";
import {
  isEnterpriseLicenseAvailable,
  isGovernmentLicenseAvailable,
} from "./index";

const createTestEnv = (overrides: Partial<SharedEnv> = {}): SharedEnv =>
  ({
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    LANGFUSE_EE_LICENSE_KEY: undefined,
    ...overrides,
  }) as SharedEnv;

describe("isGovernmentLicenseAvailable", () => {
  it("returns false on Langfuse Cloud even with a government license key", () => {
    expect(
      isGovernmentLicenseAvailable(
        createTestEnv({
          NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "us",
          LANGFUSE_EE_LICENSE_KEY: "lf_gov_test",
        }),
      ),
    ).toBe(false);
  });

  it("returns true for a self-hosted government license key", () => {
    expect(
      isGovernmentLicenseAvailable(
        createTestEnv({ LANGFUSE_EE_LICENSE_KEY: "lf_gov_test" }),
      ),
    ).toBe(true);
  });

  it("returns false for a non-government license key", () => {
    expect(
      isGovernmentLicenseAvailable(
        createTestEnv({ LANGFUSE_EE_LICENSE_KEY: "langfuse_ee_test" }),
      ),
    ).toBe(false);
  });
});

describe("isEnterpriseLicenseAvailable (control)", () => {
  it("returns true on Langfuse Cloud regardless of license key", () => {
    expect(
      isEnterpriseLicenseAvailable(
        createTestEnv({ NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "us" }),
      ),
    ).toBe(true);
  });

  it("returns true for a self-hosted government license key", () => {
    expect(
      isEnterpriseLicenseAvailable(
        createTestEnv({ LANGFUSE_EE_LICENSE_KEY: "lf_gov_test" }),
      ),
    ).toBe(true);
  });
});
