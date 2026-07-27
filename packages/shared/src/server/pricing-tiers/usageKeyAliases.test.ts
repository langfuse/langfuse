import { describe, expect, it } from "vitest";
import {
  CANONICAL_USAGE_KEY_ALIASES,
  resolveUsageKeyAlias,
} from "./usageKeyAliases";

describe("resolveUsageKeyAlias", () => {
  describe("reasoning tokens", () => {
    it("resolves output_reasoning → output_reasoning_tokens", () => {
      expect(resolveUsageKeyAlias("output_reasoning")).toBe(
        "output_reasoning_tokens",
      );
    });

    it("resolves reasoning.output_tokens → output_reasoning_tokens", () => {
      expect(resolveUsageKeyAlias("reasoning.output_tokens")).toBe(
        "output_reasoning_tokens",
      );
    });

    it("resolves reasoning_tokens → output_reasoning_tokens", () => {
      expect(resolveUsageKeyAlias("reasoning_tokens")).toBe(
        "output_reasoning_tokens",
      );
    });

    it("resolves completion_details.reasoning → output_reasoning_tokens", () => {
      expect(resolveUsageKeyAlias("completion_details.reasoning")).toBe(
        "output_reasoning_tokens",
      );
    });

    it("resolves output_reasoning_tokens to itself", () => {
      expect(resolveUsageKeyAlias("output_reasoning_tokens")).toBe(
        "output_reasoning_tokens",
      );
    });
  });

  describe("cache read tokens", () => {
    it("resolves cache_read_input_tokens → input_cached_tokens", () => {
      expect(resolveUsageKeyAlias("cache_read_input_tokens")).toBe(
        "input_cached_tokens",
      );
    });

    it("resolves input_cache_read → input_cached_tokens", () => {
      expect(resolveUsageKeyAlias("input_cache_read")).toBe(
        "input_cached_tokens",
      );
    });

    it("resolves input_cached_tokens to itself", () => {
      expect(resolveUsageKeyAlias("input_cached_tokens")).toBe(
        "input_cached_tokens",
      );
    });
  });

  describe("cache creation tokens", () => {
    it("resolves cache_creation_input_tokens → input_cache_creation", () => {
      expect(resolveUsageKeyAlias("cache_creation_input_tokens")).toBe(
        "input_cache_creation",
      );
    });

    it("resolves input_cache_write → input_cache_creation", () => {
      expect(resolveUsageKeyAlias("input_cache_write")).toBe(
        "input_cache_creation",
      );
    });
  });

  describe("unknown keys", () => {
    it("returns unknown keys unchanged", () => {
      expect(resolveUsageKeyAlias("input")).toBe("input");
      expect(resolveUsageKeyAlias("output")).toBe("output");
      expect(resolveUsageKeyAlias("total")).toBe("total");
      expect(resolveUsageKeyAlias("some_custom_key")).toBe("some_custom_key");
    });
  });

  describe("CANONICAL_USAGE_KEY_ALIASES consistency", () => {
    it("every alias resolves to its parent canonical key", () => {
      for (const [canonical, aliases] of Object.entries(
        CANONICAL_USAGE_KEY_ALIASES,
      )) {
        for (const alias of aliases) {
          expect(resolveUsageKeyAlias(alias)).toBe(canonical);
        }
        // canonical itself resolves to itself
        expect(resolveUsageKeyAlias(canonical)).toBe(canonical);
      }
    });

    it("no alias is shared between two canonical keys", () => {
      const seen = new Set<string>();
      for (const aliases of Object.values(CANONICAL_USAGE_KEY_ALIASES)) {
        for (const alias of aliases) {
          expect(seen.has(alias)).toBe(false);
          seen.add(alias);
        }
      }
    });
  });
});
