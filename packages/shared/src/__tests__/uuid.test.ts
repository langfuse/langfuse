import { describe, expect, it } from "vitest";
import { generateUUID } from "../utils/uuid";

describe("generateUUID", () => {
  it("returns a valid v4 UUID string", () => {
    const uuid = generateUUID();
    expect(typeof uuid).toBe("string");
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("falls back gracefully when crypto.randomUUID is undefined", () => {
    const originalCrypto = globalThis.crypto;
    // Simulate non-secure HTTP browser origin where crypto.randomUUID is unavailable
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: undefined },
      writable: true,
      configurable: true,
    });

    const uuid = generateUUID();
    expect(typeof uuid).toBe("string");
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      writable: true,
      configurable: true,
    });
  });
});
