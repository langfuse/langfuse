import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedEnv } from "../../../env";
import { assertFipsMode } from "./assertFipsMode";

const { getFips } = vi.hoisted(() => ({ getFips: vi.fn() }));

vi.mock("crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("crypto")>()),
  getFips,
}));

const createTestEnv = (overrides: Partial<SharedEnv> = {}): SharedEnv =>
  ({
    LANGFUSE_REQUIRE_FIPS: "true",
    LANGFUSE_EE_LICENSE_KEY: "langfuse_ee_test",
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    ...overrides,
  }) as SharedEnv;

describe("assertFipsMode", () => {
  beforeEach(() => {
    getFips.mockReset();
    getFips.mockReturnValue(1);
  });

  it("does nothing when FIPS mode is not requested", () => {
    getFips.mockReturnValue(0);

    expect(() =>
      assertFipsMode(
        createTestEnv({
          LANGFUSE_REQUIRE_FIPS: "false",
          LANGFUSE_EE_LICENSE_KEY: undefined,
        }),
      ),
    ).not.toThrow();
  });

  it("passes with an enterprise license and an active FIPS provider", () => {
    expect(() => assertFipsMode(createTestEnv())).not.toThrow();
  });

  it("passes on Langfuse Cloud with an active FIPS provider", () => {
    expect(() =>
      assertFipsMode(
        createTestEnv({
          LANGFUSE_EE_LICENSE_KEY: undefined,
          NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
        }),
      ),
    ).not.toThrow();
  });

  it.each([
    ["no license key", undefined],
    ["a pro license key", "langfuse_pro_test"],
  ])("refuses to start with %s, even on a FIPS host", (_label, licenseKey) => {
    expect(() =>
      assertFipsMode(createTestEnv({ LANGFUSE_EE_LICENSE_KEY: licenseKey })),
    ).toThrow(/enterprise license/);
  });

  it("refuses to start with a license when the FIPS provider is inactive", () => {
    getFips.mockReturnValue(0);

    expect(() => assertFipsMode(createTestEnv())).toThrow(
      /FIPS provider is not active/,
    );
  });
});
