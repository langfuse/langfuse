/**
 * Tests for JSON expansion state normalization utilities.
 *
 * These functions handle translation between actual observation keys and
 * normalized keys for persistent storage across different traces.
 *
 * Run with: pnpm test-client --testPathPattern="json-expansion-utils"
 */

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

  describe.skip("Performance Tests", () => {
    // Helper to generate random 8-char hex ID
    const generateHexId = (): string => {
      return Math.random().toString(16).slice(2, 10).padEnd(8, "0");
    };

    // Helper to generate observation keys at scale
    const generateObservationKeys = (count: number): string[] => {
      const keys: string[] = [];
      const names = [
        "filter",
        "llm-call",
        "retriever",
        "agent-step",
        "embedding",
        "tool-call",
        "chain",
        "prompt",
        "output-parser",
        "memory-lookup",
      ];

      for (let i = 0; i < count; i++) {
        const name = names[i % names.length];
        const hexId = generateHexId();
        keys.push(`${name} (${hexId})`);
      }
      return keys;
    };

    // Helper to generate expansion state from observation keys
    const generateExpansionState = (
      observationKeys: string[],
      nestedPathsPerKey: number = 0,
    ): Record<string, boolean> => {
      const state: Record<string, boolean> = {};
      const nestedPaths = ["input", "output", "metadata", "messages", "config"];

      observationKeys.forEach((key, i) => {
        // Top-level expansion
        state[key] = i % 2 === 0;

        // Add nested paths
        for (let j = 0; j < nestedPathsPerKey; j++) {
          const nestedPath = nestedPaths[j % nestedPaths.length];
          state[`${key}.${nestedPath}`] = (i + j) % 2 === 0;
        }
      });

      return state;
    };

    // Helper to generate normalized state for denormalization tests
    const generateNormalizedState = (
      count: number,
      nestedPathsPerKey: number = 0,
    ): Record<string, boolean> => {
      const state: Record<string, boolean> = {};
      const names = [
        "filter",
        "llm.call",
        "retriever",
        "agent.step",
        "embedding",
        "tool.call",
        "chain",
        "prompt",
        "output.parser",
        "memory.lookup",
      ];
      const nestedPaths = ["input", "output", "metadata", "messages", "config"];

      for (let i = 0; i < count; i++) {
        const name = names[i % names.length];
        state[name] = i % 2 === 0;

        for (let j = 0; j < nestedPathsPerKey; j++) {
          const nestedPath = nestedPaths[j % nestedPaths.length];
          state[`${name}.${nestedPath}`] = (i + j) % 2 === 0;
        }
      }

      return state;
    };

    const runNormalizeKeyTest = (count: number, threshold: number) => {
      const keys = generateObservationKeys(count);

      const start = Date.now();
      keys.forEach((key) => normalizeKey(key));
      const duration = Date.now() - start;

      console.log(`normalizeKey x${count.toLocaleString()}: ${duration}ms`);
      expect(duration).toBeLessThan(threshold);
      return duration;
    };

    const runNormalizeStateTest = (
      keyCount: number,
      nestedPaths: number,
      threshold: number,
    ) => {
      const observationKeys = generateObservationKeys(keyCount);
      const state = generateExpansionState(observationKeys, nestedPaths);
      const totalKeys = Object.keys(state).length;

      const start = Date.now();
      const result = normalizeExpansionState(state);
      const duration = Date.now() - start;

      expect(typeof result).toBe("object");
      console.log(
        `normalizeExpansionState (${totalKeys.toLocaleString()} keys): ${duration}ms`,
      );
      expect(duration).toBeLessThan(threshold);
      return duration;
    };

    const runDenormalizeStateTest = (
      keyCount: number,
      observationCount: number,
      nestedPaths: number,
      threshold: number,
    ) => {
      const normalizedState = generateNormalizedState(keyCount, nestedPaths);
      const observationKeys = generateObservationKeys(observationCount);
      const totalNormalizedKeys = Object.keys(normalizedState).length;

      const start = Date.now();
      const result = denormalizeExpansionState(
        normalizedState,
        observationKeys,
      );
      const duration = Date.now() - start;

      expect(typeof result).toBe("object");
      console.log(
        `denormalizeExpansionState (${totalNormalizedKeys.toLocaleString()} normalized keys, ${observationCount.toLocaleString()} observations): ${duration}ms`,
      );
      expect(duration).toBeLessThan(threshold);
      return duration;
    };

    describe("1k scale", () => {
      const scale = 1_000;
      const threshold = 50; // 50ms

      it("normalizes 1k keys", () => {
        runNormalizeKeyTest(scale, threshold);
      });

      it("normalizes expansion state with 1k keys", () => {
        runNormalizeStateTest(scale, 0, threshold);
      });

      it("normalizes expansion state with 1k keys and nested paths", () => {
        runNormalizeStateTest(scale, 3, threshold);
      });

      it("denormalizes state with 1k observations", () => {
        runDenormalizeStateTest(100, scale, 0, threshold);
      });

      it("denormalizes state with 1k observations and nested paths", () => {
        runDenormalizeStateTest(100, scale, 3, threshold);
      });
    });

    describe("10k scale", () => {
      const scale = 10_000;
      const threshold = 200; // 200ms

      it("normalizes 10k keys", () => {
        runNormalizeKeyTest(scale, threshold);
      });

      it("normalizes expansion state with 10k keys", () => {
        runNormalizeStateTest(scale, 0, threshold);
      });

      it("normalizes expansion state with 10k keys and nested paths", () => {
        runNormalizeStateTest(scale, 3, threshold);
      });

      it("denormalizes state with 10k observations", () => {
        runDenormalizeStateTest(100, scale, 0, threshold);
      });

      it("denormalizes state with 10k observations and nested paths", () => {
        runDenormalizeStateTest(100, scale, 3, threshold);
      });
    });

    describe("25k scale", () => {
      const scale = 25_000;
      const threshold = 500; // 500ms

      it("normalizes 25k keys", () => {
        runNormalizeKeyTest(scale, threshold);
      });

      it("normalizes expansion state with 25k keys", () => {
        runNormalizeStateTest(scale, 0, threshold);
      });

      it("denormalizes state with 25k observations", () => {
        runDenormalizeStateTest(100, scale, 0, threshold);
      });
    });

    describe("50k scale", () => {
      const scale = 50_000;
      const threshold = 1_000; // 1s

      it("normalizes 50k keys", () => {
        runNormalizeKeyTest(scale, threshold);
      });

      it("normalizes expansion state with 50k keys", () => {
        runNormalizeStateTest(scale, 0, threshold);
      });

      it("denormalizes state with 50k observations", () => {
        runDenormalizeStateTest(100, scale, 0, threshold);
      });
    });

    describe("100k scale", () => {
      const scale = 100_000;
      const threshold = 2_000; // 2s

      it("normalizes 100k keys", () => {
        runNormalizeKeyTest(scale, threshold);
      });

      it("normalizes expansion state with 100k keys", () => {
        runNormalizeStateTest(scale, 0, threshold);
      });

      it("denormalizes state with 100k observations", () => {
        runDenormalizeStateTest(100, scale, 0, threshold);
      });
    });

    describe("500k scale", () => {
      const scale = 500_000;
      const threshold = 10_000; // 10s

      it("normalizes 500k keys", () => {
        runNormalizeKeyTest(scale, threshold);
      });

      it("normalizes expansion state with 500k keys", () => {
        runNormalizeStateTest(scale, 0, threshold);
      });

      it("denormalizes state with 500k observations", () => {
        runDenormalizeStateTest(100, scale, 0, threshold);
      });
    });

    describe("1M scale", () => {
      const scale = 1_000_000;
      const threshold = 30_000; // 30s

      it("normalizes 1M keys", () => {
        runNormalizeKeyTest(scale, threshold);
      });

      it("normalizes expansion state with 1M keys", () => {
        runNormalizeStateTest(scale, 0, threshold);
      });

      it("denormalizes state with 1M observations", () => {
        runDenormalizeStateTest(100, scale, 0, threshold);
      });
    });

    describe("5M scale", () => {
      const scale = 5_000_000;
      const threshold = 120_000; // 2 minutes

      it("normalizes 5M keys", () => {
        runNormalizeKeyTest(scale, threshold);
      });

      it("normalizes expansion state with 5M keys", () => {
        runNormalizeStateTest(scale, 0, threshold);
      });

      it("denormalizes state with 5M observations", () => {
        runDenormalizeStateTest(100, scale, 0, threshold);
      });
    });
  });
});
