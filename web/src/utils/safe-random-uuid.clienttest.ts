import { describe, expect, it, vi } from "vitest";

import { safeRandomUUID } from "@/src/utils/safe-random-uuid";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("safeRandomUUID", () => {
  it("returns RFC 4122 v4 ids", () => {
    expect(safeRandomUUID()).toMatch(UUID_V4_REGEX);
  });

  it("returns unique ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => safeRandomUUID()));
    expect(ids.size).toBe(100);
  });

  it("uses the native crypto.randomUUID when present", async () => {
    // Import a fresh module instance against the stubbed global so the test
    // holds regardless of whether uuid binds crypto.randomUUID at module
    // load (v11) or reads it at call time (v14).
    const sentinel = "11111111-2222-4333-8444-555555555555";
    vi.stubGlobal("crypto", { randomUUID: () => sentinel });
    vi.resetModules();
    try {
      const { safeRandomUUID: fresh } =
        await import("@/src/utils/safe-random-uuid");
      expect(fresh()).toBe(sentinel);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it("falls back to crypto.getRandomValues when randomUUID is unavailable (non-secure context)", async () => {
    const realCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
    });
    vi.resetModules();
    try {
      const { safeRandomUUID: fresh } =
        await import("@/src/utils/safe-random-uuid");
      expect(fresh()).toMatch(UUID_V4_REGEX);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
