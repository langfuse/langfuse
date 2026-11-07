import { afterEach, describe, expect, it, vi } from "vitest";

describe("skill size limit configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("keeps the defaults without overrides", async () => {
    const limits = await import("./constants");
    expect(limits.MAX_SKILL_BYTES).toBe(1_000_000);
    expect(limits.MAX_SKILL_ZIP_UPLOAD_BYTES).toBe(3 * 1024 * 1024);
    expect(limits.MAX_SKILL_REQUEST_BODY_BYTES).toBe(4.5 * 1024 * 1024);
  });

  it("applies integer overrides", async () => {
    vi.stubEnv("LANGFUSE_SKILL_MAX_BYTES", "5242880");
    vi.stubEnv("LANGFUSE_SKILL_IMPORT_MAX_ZIP_BYTES", "20971520");
    const limits = await import("./constants");
    expect(limits.MAX_SKILL_BYTES).toBe(5_242_880);
    expect(limits.MAX_SKILL_ZIP_UPLOAD_BYTES).toBe(20_971_520);
    expect(limits.MAX_SKILL_REQUEST_BODY_BYTES).toBe(
      5_242_880 * 2 + 1024 * 1024,
    );
  });

  it("falls back to defaults for unparseable or non-positive overrides", async () => {
    vi.stubEnv("LANGFUSE_SKILL_MAX_BYTES", "not-a-number");
    vi.stubEnv("LANGFUSE_SKILL_IMPORT_MAX_ZIP_BYTES", "-1");
    const limits = await import("./constants");
    expect(limits.MAX_SKILL_BYTES).toBe(1_000_000);
    expect(limits.MAX_SKILL_ZIP_UPLOAD_BYTES).toBe(3 * 1024 * 1024);
  });

  it("caps overrides at 100 MiB", async () => {
    vi.stubEnv("LANGFUSE_SKILL_MAX_BYTES", String(500 * 1024 * 1024));
    const limits = await import("./constants");
    expect(limits.MAX_SKILL_BYTES).toBe(100 * 1024 * 1024);
  });
});
