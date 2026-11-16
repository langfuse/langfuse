import { afterEach, describe, expect, it, vi } from "vitest";

describe("v4 migration banner config", () => {
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
    const { getV4MigrationBannerConfig } =
      await import("@/src/features/v4-migration/server/v4MigrationBannerConfig");
    return getV4MigrationBannerConfig;
  }

  it("uses fixed copy and hides exempt orgs, self-hosted, and off banners", async () => {
    const configured = await loadState({
      LANGFUSE_V4_BANNER_SEVERITY: "critical",
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
        message:
          "Action required: After November 16, 2026, some features may stop working for at least one of your projects.",
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
    });
    expect(off({ orgId: "org-a", isLangfuseCloud: true }).severity).toBe("off");
  });
});
