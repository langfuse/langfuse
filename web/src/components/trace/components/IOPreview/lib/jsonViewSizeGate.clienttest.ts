import { describe, expect, it } from "vitest";
import {
  JSON_VIEW_RENDER_CHAR_LIMIT,
  getJsonStringSize,
} from "./jsonViewSizeGate";

// The component gates a field with `getJsonStringSize(x) > JSON_VIEW_RENDER_CHAR_LIMIT`.
const isTooLarge = (value: unknown): boolean =>
  getJsonStringSize(value) > JSON_VIEW_RENDER_CHAR_LIMIT;

describe("jsonViewSizeGate", () => {
  describe("getJsonStringSize", () => {
    it("returns 0 for null / undefined", () => {
      expect(getJsonStringSize(null)).toBe(0);
      expect(getJsonStringSize(undefined)).toBe(0);
    });

    it("measures strings by length without serializing", () => {
      expect(getJsonStringSize("hello")).toBe(5);
      expect(getJsonStringSize("")).toBe(0);
    });

    it("measures objects and arrays via JSON.stringify length", () => {
      const obj = { a: 1, b: "two" };
      expect(getJsonStringSize(obj)).toBe(JSON.stringify(obj).length);

      const arr = [1, 2, 3];
      expect(getJsonStringSize(arr)).toBe(JSON.stringify(arr).length);
    });

    it("returns 0 for values that cannot be serialized (circular)", () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      expect(getJsonStringSize(circular)).toBe(0);
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
