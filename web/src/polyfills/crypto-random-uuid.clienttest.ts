// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  installCryptoRandomUUIDPolyfill,
  installGetRandomValuesOperationErrorFallback,
  isFirefoxGetRandomValuesOperationError,
} from "@/src/polyfills/crypto-random-uuid";

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

describe("isFirefoxGetRandomValuesOperationError", () => {
  it("matches Firefox's OperationError from getRandomValues", () => {
    expect(
      isFirefoxGetRandomValuesOperationError(
        new DOMException(
          "The operation failed for an operation-specific reason",
          "OperationError",
        ),
      ),
    ).toBe(true);
  });

  it("matches the same wording with a trailing period", () => {
    expect(
      isFirefoxGetRandomValuesOperationError(
        new DOMException(
          "The operation failed for an operation-specific reason.",
          "OperationError",
        ),
      ),
    ).toBe(true);
  });

  it("does not match QuotaExceededError (typed array too large)", () => {
    expect(
      isFirefoxGetRandomValuesOperationError(
        new DOMException("The quota has been exceeded.", "QuotaExceededError"),
      ),
    ).toBe(false);
  });

  it("does not match a different OperationError message", () => {
    expect(
      isFirefoxGetRandomValuesOperationError(
        new DOMException(
          "A mutation operation was attempted on a database",
          "OperationError",
        ),
      ),
    ).toBe(false);
  });

  it("does not match a non-DOMException", () => {
    expect(
      isFirefoxGetRandomValuesOperationError(
        new TypeError("crypto.getRandomValues is not a function"),
      ),
    ).toBe(false);
  });
});

describe("installGetRandomValuesOperationErrorFallback", () => {
  it("fills the buffer when getRandomValues throws Firefox OperationError", () => {
    const target = {
      getRandomValues: () => {
        throw new DOMException(
          "The operation failed for an operation-specific reason",
          "OperationError",
        );
      },
    };

    installGetRandomValuesOperationErrorFallback(target);

    const buffer = new Uint8Array(16);
    expect(() => target.getRandomValues(buffer)).not.toThrow();
    expect(buffer.some((byte) => byte !== 0)).toBe(true);
  });

  it("rethrows QuotaExceededError so oversized arrays still fail", () => {
    const target = {
      getRandomValues: () => {
        throw new DOMException(
          "The quota has been exceeded.",
          "QuotaExceededError",
        );
      },
    };

    installGetRandomValuesOperationErrorFallback(target);

    expect(() => target.getRandomValues(new Uint8Array(16))).toThrow(
      DOMException,
    );
  });

  it("leaves a working getRandomValues implementation unchanged", () => {
    const realCrypto = globalThis.crypto;
    const target = {
      getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
    };

    installGetRandomValuesOperationErrorFallback(target);

    const buffer = new Uint8Array(8);
    const result = target.getRandomValues(buffer);
    expect(result).toBe(buffer);
    expect(buffer.some((byte) => byte !== 0)).toBe(true);
  });

  it("no-ops when getRandomValues is missing", () => {
    const target: {
      getRandomValues?: (array: ArrayBufferView) => ArrayBufferView;
    } = {};
    expect(() =>
      installGetRandomValuesOperationErrorFallback(target),
    ).not.toThrow();
    expect(target.getRandomValues).toBeUndefined();
  });

  it("wraps the global getRandomValues on module import", async () => {
    const throwingCrypto = {
      getRandomValues: () => {
        throw new DOMException(
          "The operation failed for an operation-specific reason",
          "OperationError",
        );
      },
    };
    vi.stubGlobal("crypto", throwingCrypto);
    vi.resetModules();
    try {
      await import("@/src/polyfills/crypto-random-uuid");
      const buffer = new Uint8Array(8);
      expect(() => throwingCrypto.getRandomValues(buffer)).not.toThrow();
      expect(buffer.some((byte) => byte !== 0)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
