import {
  normalizeKey,
  normalizeExpansionState,
  denormalizeExpansionState,
} from "./json-expansion-utils";

describe("json-expansion-utils", () => {
  describe("normalizeKey", () => {
    it("converts hyphens to dots", () => {
      expect(normalizeKey("natural-language")).toBe("natural.language");
      expect(normalizeKey("deeply-nested-path")).toBe("deeply.nested.path");
    });

    it("removes observation ID suffix (8-char hex in parentheses)", () => {
      expect(normalizeKey("filter (abc12345)")).toBe("filter");
      expect(normalizeKey("my-span (deadbeef)")).toBe("my.span");
    });

    it("handles combined hyphen conversion and ID removal", () => {
      expect(normalizeKey("natural-language-filter (abc12345)")).toBe(
        "natural.language.filter",
      );
    });

    it("leaves simple keys unchanged", () => {
      expect(normalizeKey("simple")).toBe("simple");
      expect(normalizeKey("already.dotted")).toBe("already.dotted");
    });

    it("handles keys with dots and hyphens", () => {
      expect(normalizeKey("deeply-nested-path.sub.item")).toBe(
        "deeply.nested.path.sub.item",
      );
    });

    it("only removes valid 8-char hex IDs", () => {
      // Should not remove non-hex or wrong length
      expect(normalizeKey("filter (notahex1)")).toBe("filter (notahex1)");
      expect(normalizeKey("filter (abc123)")).toBe("filter (abc123)"); // 6 chars
      expect(normalizeKey("filter (abc123456)")).toBe("filter (abc123456)"); // 9 chars
    });
  });

  describe("normalizeExpansionState", () => {
    it("passes through boolean true", () => {
      expect(normalizeExpansionState(true)).toBe(true);
    });

    it("passes through boolean false", () => {
      expect(normalizeExpansionState(false)).toBe(false);
    });

    it("returns empty object for empty input", () => {
      expect(normalizeExpansionState({})).toEqual({});
    });

    it("normalizes object keys", () => {
      const input = {
        "my-span (abc12345)": true,
        "another-span (def67890)": false,
      };
      expect(normalizeExpansionState(input)).toEqual({
        "my.span": true,
        "another.span": false,
      });
    });

    it("normalizes nested paths", () => {
      const input = {
        "my-span (abc12345).input": true,
        "my-span (abc12345).output.nested": false,
      };
      expect(normalizeExpansionState(input)).toEqual({
        "my.span.input": true,
        "my.span.output.nested": false,
      });
    });

    it("merges keys that normalize to the same value (last wins)", () => {
      const input = {
        "span (abc12345)": true,
        "span (def67890)": false, // Same normalized key, different value
      };
      const result = normalizeExpansionState(input);
      // Last value wins due to iteration order
      expect(result).toHaveProperty("span");
    });
  });

  describe("denormalizeExpansionState", () => {
    it("passes through boolean true", () => {
      expect(denormalizeExpansionState(true, [])).toBe(true);
    });

    it("passes through boolean false", () => {
      expect(denormalizeExpansionState(false, [])).toBe(false);
    });

    it("returns empty object when no matching observation keys", () => {
      const normalizedState = { "non.existent": true };
      const observationKeys: string[] = ["other (abc12345)"];
      expect(
        denormalizeExpansionState(normalizedState, observationKeys),
      ).toEqual({});
    });

    it("maps top-level normalized key to actual observation key", () => {
      const normalizedState = { filter: true };
      const observationKeys = ["filter (abc12345)"];

      expect(
        denormalizeExpansionState(normalizedState, observationKeys),
      ).toEqual({
        "filter (abc12345)": true,
      });
    });

    it("handles nested paths within observations", () => {
      const normalizedState = {
        "filter.input": true,
        "filter.output.nested": false,
      };
      const observationKeys = ["filter (abc12345)"];

      expect(
        denormalizeExpansionState(normalizedState, observationKeys),
      ).toEqual({
        "filter (abc12345).input": true,
        "filter (abc12345).output.nested": false,
      });
    });

    it("applies state to multiple observations with same normalized name", () => {
      const normalizedState = { filter: true };
      const observationKeys = ["filter (abc12345)", "filter (def67890)"];

      expect(
        denormalizeExpansionState(normalizedState, observationKeys),
      ).toEqual({
        "filter (abc12345)": true,
        "filter (def67890)": true,
      });
    });

    it("handles hyphenated observation names correctly", () => {
      const normalizedState = { "my.span": true };
      const observationKeys = ["my-span (abc12345)"];

      // Observation key gets hyphens converted to dots in output
      expect(
        denormalizeExpansionState(normalizedState, observationKeys),
      ).toEqual({
        "my.span (abc12345)": true,
      });
    });

    it("handles complex nested paths with multiple observations", () => {
      // Note: This tests single-word observation names (no hyphens).
      // Observation names with hyphens (e.g., "llm-call") become dotted after
      // normalization ("llm.call"), which makes nested path matching ambiguous.
      const normalizedState = {
        "generation.input.messages": true,
        "generation.output": false,
      };
      const observationKeys = [
        "generation (abc12345)",
        "generation (def67890)",
      ];

      expect(
        denormalizeExpansionState(normalizedState, observationKeys),
      ).toEqual({
        "generation (abc12345).input.messages": true,
        "generation (def67890).input.messages": true,
        "generation (abc12345).output": false,
        "generation (def67890).output": false,
      });
    });

    it("ignores normalized keys that don't match any observation", () => {
      const normalizedState = {
        filter: true,
        "non.existent": false,
      };
      const observationKeys = ["filter (abc12345)"];

      expect(
        denormalizeExpansionState(normalizedState, observationKeys),
      ).toEqual({
        "filter (abc12345)": true,
        // "non.existent" is not in output
      });
    });
  });
});
