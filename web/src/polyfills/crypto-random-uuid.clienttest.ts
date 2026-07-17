import { describe, expect, it, vi } from "vitest";

import { installCryptoRandomUUIDPolyfill } from "@/src/polyfills/crypto-random-uuid";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("installCryptoRandomUUIDPolyfill", () => {
  it("installs a uuid-v4 fallback when crypto.randomUUID is missing", () => {
    const target: { randomUUID?: () => string } = {};

    installCryptoRandomUUIDPolyfill(target);

    expect(target.randomUUID).toBeTypeOf("function");
    expect(target.randomUUID!()).toMatch(UUID_V4_REGEX);
    expect(target.randomUUID!()).not.toBe(target.randomUUID!());
  });

  it("keeps the native implementation when present", () => {
    const native = () => "native-uuid";
    const target = { randomUUID: native };

    installCryptoRandomUUIDPolyfill(target);

    expect(target.randomUUID).toBe(native);
  });

  it("no-ops when no crypto object exists at all", () => {
    // Stub the global itself: explicitly passing `undefined` would trigger
    // the `globalThis.crypto` default parameter instead of the guard.
    vi.stubGlobal("crypto", undefined);
    try {
      expect(() => installCryptoRandomUUIDPolyfill()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("polyfills the global crypto object on module import (non-secure context)", async () => {
    // Simulate a non-secure browser context: crypto exists but randomUUID
    // does not. Re-importing the module must install the fallback via its
    // module-scope side effect — the mechanism _app.tsx relies on.
    const realCrypto = globalThis.crypto;
    const bareCrypto = {
      getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
    } as Crypto;
    vi.stubGlobal("crypto", bareCrypto);
    vi.resetModules();
    try {
      await import("@/src/polyfills/crypto-random-uuid");
      expect(bareCrypto.randomUUID).toBeTypeOf("function");
      expect(bareCrypto.randomUUID()).toMatch(UUID_V4_REGEX);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
