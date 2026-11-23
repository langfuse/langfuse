import { afterEach, describe, expect, it, vi } from "vitest";
import { V4_MIGRATION_TOP_BANNER_MESSAGE } from "@/src/features/v4-migration/v4MigrationBannerCopy";

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

  it("uses fixed copy and hides self-hosted and off banners", async () => {
    const configured = await loadState({
      LANGFUSE_V4_BANNER_SEVERITY: "critical",
    });

    expect(configured({ isLangfuseCloud: true })).toEqual({
      severity: "critical",
      message: V4_MIGRATION_TOP_BANNER_MESSAGE,
    });
    expect(configured({ isLangfuseCloud: false })).toEqual({
      severity: "off",
      message: null,
    });

    const off = await loadState({
      LANGFUSE_V4_BANNER_SEVERITY: "off",
    });
    expect(off({ isLangfuseCloud: true }).severity).toBe("off");
  });
});
