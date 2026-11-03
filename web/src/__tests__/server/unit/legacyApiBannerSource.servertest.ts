import { afterEach, describe, expect, it, vi } from "vitest";

describe("legacy API banner config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  async function loadState(overrides: Record<string, string | undefined>) {
    vi.resetModules();
    process.env = { ...originalEnv };
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const { getLegacyApiBannerState } =
      await import("@/src/features/v4-migration/server/legacyApiBannerSource");
    return getLegacyApiBannerState;
  }

  it("returns the configured severity and message on cloud", async () => {
    const getLegacyApiBannerState = await loadState({
      LANGFUSE_V4_BANNER_SEVERITY: "warning",
      LANGFUSE_V4_BANNER_MESSAGE: "Legacy v3 is still in use in {projects}.",
      LANGFUSE_V4_BANNER_EXEMPT_ORG_IDS: undefined,
    });

    expect(
      getLegacyApiBannerState({ orgId: "org-a", isLangfuseCloud: true }),
    ).toEqual({
      severity: "warning",
      message: "Legacy v3 is still in use in {projects}.",
      exempt: false,
    });
  });

  it("exempts each trimmed, comma-separated org id", async () => {
    const getLegacyApiBannerState = await loadState({
      LANGFUSE_V4_BANNER_SEVERITY: "critical",
      LANGFUSE_V4_BANNER_MESSAGE: "Legacy v3 is paused.",
      LANGFUSE_V4_BANNER_EXEMPT_ORG_IDS: " org-yelp , ,org-b",
    });

    expect(
      getLegacyApiBannerState({ orgId: "org-yelp", isLangfuseCloud: true }),
    ).toEqual({ severity: "off", message: null, exempt: true });
    expect(
      getLegacyApiBannerState({ orgId: "org-b", isLangfuseCloud: true }).exempt,
    ).toBe(true);
    expect(
      getLegacyApiBannerState({ orgId: "org-c", isLangfuseCloud: true }),
    ).toMatchObject({ severity: "critical", exempt: false });
  });

  it("is off when unset, when severity is off, or when the message is blank", async () => {
    const unset = await loadState({
      LANGFUSE_V4_BANNER_SEVERITY: undefined,
      LANGFUSE_V4_BANNER_MESSAGE: undefined,
      LANGFUSE_V4_BANNER_EXEMPT_ORG_IDS: undefined,
    });
    expect(unset({ orgId: "org-a", isLangfuseCloud: true })).toEqual({
      severity: "off",
      message: null,
      exempt: false,
    });

    const off = await loadState({
      LANGFUSE_V4_BANNER_SEVERITY: "off",
      LANGFUSE_V4_BANNER_MESSAGE: "Legacy v3 is paused.",
    });
    expect(off({ orgId: "org-a", isLangfuseCloud: true }).severity).toBe("off");

    const blank = await loadState({
      LANGFUSE_V4_BANNER_SEVERITY: "warning",
      LANGFUSE_V4_BANNER_MESSAGE: "   ",
    });
    expect(blank({ orgId: "org-a", isLangfuseCloud: true })).toMatchObject({
      severity: "off",
      message: null,
    });
  });

  it("hides the banner on self-hosted even when configured", async () => {
    const getLegacyApiBannerState = await loadState({
      LANGFUSE_V4_BANNER_SEVERITY: "critical",
      LANGFUSE_V4_BANNER_MESSAGE: "Legacy v3 is paused.",
      LANGFUSE_V4_BANNER_EXEMPT_ORG_IDS: undefined,
    });

    expect(
      getLegacyApiBannerState({ orgId: "org-a", isLangfuseCloud: false }),
    ).toEqual({ severity: "off", message: null, exempt: false });
  });
});
