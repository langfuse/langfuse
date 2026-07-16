import { describe, expect, it, vi } from "vitest";
import {
  JSON_VIEW_RENDER_CHAR_LIMIT,
  probeJsonField,
} from "./jsonViewSizeGate";

// The component gates a field with `probeJsonField(x).size > JSON_VIEW_RENDER_CHAR_LIMIT`.
const isTooLarge = (value: unknown): boolean =>
  probeJsonField(value).size > JSON_VIEW_RENDER_CHAR_LIMIT;

describe("jsonViewSizeGate", () => {
  describe("probeJsonField", () => {
    it("reports size 0 and no serialization for null / undefined", () => {
      expect(probeJsonField(null)).toEqual({
        size: 0,
        serialized: "",
        isString: false,
      });
      expect(probeJsonField(undefined)).toEqual({
        size: 0,
        serialized: "",
        isString: false,
      });
    });

    it("passes strings through raw, without JSON-quoting", () => {
      expect(probeJsonField("hello")).toEqual({
        size: 5,
        serialized: "hello",
        isString: true,
      });
      // A base64-ish string is returned verbatim (no surrounding quotes).
      const b64 = "eyJhIjoxfQ==";
      const probe = probeJsonField(b64);
      expect(probe.serialized).toBe(b64);
      expect(probe.isString).toBe(true);
    });

    it("serializes objects and arrays exactly once (compact JSON)", () => {
      const obj = { a: 1, b: "two" };
      const probe = probeJsonField(obj);
      expect(probe.serialized).toBe(JSON.stringify(obj));
      expect(probe.size).toBe(JSON.stringify(obj).length);
      expect(probe.isString).toBe(false);

      const arr = [1, 2, 3];
      expect(probeJsonField(arr).serialized).toBe(JSON.stringify(arr));
    });

    it("calls JSON.stringify only once per object (no double serialization)", () => {
      const spy = vi.spyOn(JSON, "stringify");
      const obj = { nested: { deep: [1, 2, 3] } };
      probeJsonField(obj);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it("reports size 0 for values that cannot be serialized (circular)", () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      expect(probeJsonField(circular)).toEqual({
        size: 0,
        serialized: "",
        isString: false,
      });
    });
  });

  describe("gating decision (size vs JSON_VIEW_RENDER_CHAR_LIMIT)", () => {
    it("does not gate normal, small I/O", () => {
      expect(isTooLarge(null)).toBe(false);
      expect(isTooLarge("short string")).toBe(false);
      expect(isTooLarge({ messages: [{ role: "user" }] })).toBe(false);
    });

    it("gates a payload over the limit", () => {
      const huge = "x".repeat(JSON_VIEW_RENDER_CHAR_LIMIT + 1);
      expect(isTooLarge(huge)).toBe(true);
    });

    it("does not gate exactly at the limit (strictly greater-than)", () => {
      const atLimit = "x".repeat(JSON_VIEW_RENDER_CHAR_LIMIT);
      expect(isTooLarge(atLimit)).toBe(false);
    });

    it("gates a ~20 MB payload (the measured crash target)", () => {
      const twentyMb = "x".repeat(20_000_000);
      expect(isTooLarge(twentyMb)).toBe(true);
    });

    it("keeps the limit conservative (well above KB-scale, safely below ~20 MB)", () => {
      expect(JSON_VIEW_RENDER_CHAR_LIMIT).toBe(2_000_000);
      expect(JSON_VIEW_RENDER_CHAR_LIMIT).toBeGreaterThan(500_000);
      expect(JSON_VIEW_RENDER_CHAR_LIMIT).toBeLessThan(20_000_000);
    });
  });
});
