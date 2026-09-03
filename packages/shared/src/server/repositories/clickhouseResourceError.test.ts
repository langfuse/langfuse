import { describe, it, expect } from "vitest";
import { ClickHouseResourceError } from "./clickhouse";

describe("ClickHouseResourceError", () => {
  describe("wrapIfResourceError", () => {
    const cases = [
      {
        name: "capitalized per-query memory limit",
        message:
          "Memory limit (for query) exceeded: would use 2.25 GiB (attempt to allocate chunk of 0.00 B), current RSS: 1.42 GiB, maximum: 2.25 GiB",
        expectedType: "MEMORY_LIMIT",
      },
      {
        name: "capitalized total memory limit",
        message:
          "Memory limit (total) exceeded: would use 2.25 GiB, current RSS: 1.42 GiB, maximum: 2.25 GiB",
        expectedType: "MEMORY_LIMIT",
      },
      {
        name: "capitalized user memory limit",
        message: "Memory limit (for user) exceeded: would use 2.25 GiB",
        expectedType: "MEMORY_LIMIT",
      },
      {
        name: "lowercase total memory limit",
        message:
          "(total) memory limit exceeded: would use 2.25 GiB (attempt to allocate chunk of 0.00 B)",
        expectedType: "MEMORY_LIMIT",
      },
      {
        name: "simple memory limit exceeded",
        message: "memory limit exceeded",
        expectedType: "MEMORY_LIMIT",
      },
      {
        name: "OvercommitTracker decision",
        message:
          "OvercommitTracker decision: Query was selected to stop by OvercommitTracker: While executing AggregatingTransform",
        expectedType: "OVERCOMMIT",
      },
      {
        name: "case-insensitive overcommittracker",
        message: "query stopped by overcommittracker",
        expectedType: "OVERCOMMIT",
      },
      {
        name: "socket timeout",
        message: "Timeout exceeded while reading from socket",
        expectedType: "TIMEOUT",
      },
      {
        name: "timed out error",
        message: "Request timed out after 30000ms",
        expectedType: "TIMEOUT",
      },
    ];

    cases.forEach(({ name, message, expectedType }) => {
      it(`wraps ${name} as ${expectedType}`, () => {
        const error = new Error(message);
        const wrapped = ClickHouseResourceError.wrapIfResourceError(error);

        expect(wrapped).toBeInstanceOf(ClickHouseResourceError);
        expect(ClickHouseResourceError.is(wrapped)).toBe(true);
        expect((wrapped as ClickHouseResourceError).errorType).toBe(
          expectedType,
        );
      });
    });

    it("does not wrap regular SQL errors", () => {
      const error = new Error("Table 'test.non_existent' doesn't exist");
      const wrapped = ClickHouseResourceError.wrapIfResourceError(error);

      expect(wrapped).toBe(error);
      expect(wrapped).not.toBeInstanceOf(ClickHouseResourceError);
      expect(ClickHouseResourceError.is(wrapped)).toBe(false);
    });
  });

  describe("is", () => {
    it("returns true for ClickHouseResourceError instances", () => {
      const error = new ClickHouseResourceError(
        "MEMORY_LIMIT",
        new Error("out of memory"),
      );
      expect(ClickHouseResourceError.is(error)).toBe(true);
    });

    it("returns true for errors matching name ClickHouseResourceError across boundaries", () => {
      const fakeError = new Error("resource limit");
      fakeError.name = "ClickHouseResourceError";
      expect(ClickHouseResourceError.is(fakeError)).toBe(true);
    });

    it("returns false for standard errors and non-errors", () => {
      expect(ClickHouseResourceError.is(new Error("generic"))).toBe(false);
      expect(ClickHouseResourceError.is(null)).toBe(false);
      expect(ClickHouseResourceError.is(undefined)).toBe(false);
      expect(ClickHouseResourceError.is("ClickHouseResourceError")).toBe(false);
      expect(ClickHouseResourceError.is({})).toBe(false);
    });
  });
});
