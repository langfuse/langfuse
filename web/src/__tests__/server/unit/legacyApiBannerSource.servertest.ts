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

  it("hides exempt orgs, self-hosted, and a blank or off banner", async () => {
    const configured = await loadState({
      LANGFUSE_V4_BANNER_SEVERITY: "critical",
      LANGFUSE_V4_BANNER_MESSAGE: "Legacy v3 is paused.",
      LANGFUSE_V4_BANNER_EXEMPT_ORG_IDS: " org-yelp , ,org-b",
    });

    expect(configured({ orgId: "org-yelp", isLangfuseCloud: true })).toEqual({
      severity: "off",
      message: null,
      exempt: true,
    });
    expect(configured({ orgId: "org-b", isLangfuseCloud: true }).exempt).toBe(
      true,
    );
    expect(configured({ orgId: "org-c", isLangfuseCloud: true })).toMatchObject(
      {
        severity: "critical",
        message: "Legacy v3 is paused.",
        exempt: false,
      },
    );
    expect(configured({ orgId: "org-c", isLangfuseCloud: false })).toEqual({
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
    expect(blank({ orgId: "org-a", isLangfuseCloud: true }).message).toBeNull();
  });
});
