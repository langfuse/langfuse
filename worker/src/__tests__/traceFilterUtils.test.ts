import { describe, expect, test } from "vitest";
import {
  mapTraceFilterColumn,
  requiresDatabaseLookup,
} from "../features/evaluation/traceFilterUtils";
import { TraceDomain } from "@langfuse/shared";

describe("traceFilterUtils", () => {
  const mockTrace: TraceDomain = {
    id: "trace-123",
    name: "test-trace",
    timestamp: new Date("2024-01-01T10:00:00Z"),
    environment: "production",
    tags: ["tag1", "tag2"],
    bookmarked: true,
    public: false,
    release: "v1.0.0",
    version: "v1.0",
    input: { query: "What is the capital of France?" },
    output: { answer: "The capital of France is Paris." },
    metadata: { userId: "user-123" },
    createdAt: new Date("2024-01-01T09:00:00Z"),
    updatedAt: new Date("2024-01-01T10:00:00Z"),
    sessionId: "session-456",
    userId: "user-123",
    projectId: "project-789",
  };

  describe("mapTraceFilterColumn", () => {
    test("maps input field correctly", () => {
      const result = mapTraceFilterColumn(mockTrace, "Input");
      expect(result).toEqual({ query: "What is the capital of France?" });
    });

    test("maps output field correctly", () => {
      const result = mapTraceFilterColumn(mockTrace, "Output");
      expect(result).toEqual({ answer: "The capital of France is Paris." });
    });

    test("maps id field correctly", () => {
      const result = mapTraceFilterColumn(mockTrace, "ID");
      expect(result).toBe("trace-123");
    });

    test("maps name field correctly", () => {
      const result = mapTraceFilterColumn(mockTrace, "Name");
      expect(result).toBe("test-trace");
    });

    test("maps timestamp field correctly", () => {
      const result = mapTraceFilterColumn(mockTrace, "Timestamp");
      expect(result).toEqual(new Date("2024-01-01T10:00:00Z"));
    });

    test("maps environment field correctly", () => {
      const result = mapTraceFilterColumn(mockTrace, "Environment");
      expect(result).toBe("production");
    });

    test("maps tags field correctly", () => {
      const result = mapTraceFilterColumn(mockTrace, "Tags");
      expect(result).toEqual(["tag1", "tag2"]);
    });

    test("maps bookmarked field correctly", () => {
      const result = mapTraceFilterColumn(mockTrace, "⭐️");
      expect(result).toBe(true);
    });

    test("maps release field correctly", () => {
      const result = mapTraceFilterColumn(mockTrace, "Release");
      expect(result).toBe("v1.0.0");
    });

    test("maps version field correctly", () => {
      const result = mapTraceFilterColumn(mockTrace, "Version");
      expect(result).toBe("v1.0");
    });

    test("maps userId field correctly", () => {
      const result = mapTraceFilterColumn(mockTrace, "User ID");
      expect(result).toBe("user-123");
    });

    test("maps sessionId field correctly", () => {
      const result = mapTraceFilterColumn(mockTrace, "Session ID");
      expect(result).toBe("session-456");
    });

    test("maps metadata field correctly", () => {
      const result = mapTraceFilterColumn(mockTrace, "Metadata");
      expect(result).toEqual({ userId: "user-123" });
    });

    test("throws error for unhandled column", () => {
      expect(() => mapTraceFilterColumn(mockTrace, "InvalidColumn")).toThrow(
        "Unhandled column for trace filter: InvalidColumn",
      );
    });

    test("handles null input/output", () => {
      const traceWithNulls: TraceDomain = {
        ...mockTrace,
        input: null,
        output: null,
      };
      expect(mapTraceFilterColumn(traceWithNulls, "Input")).toBeNull();
      expect(mapTraceFilterColumn(traceWithNulls, "Output")).toBeNull();
    });
  });

  describe("requiresDatabaseLookup", () => {
    test("returns false for empty filter", () => {
      expect(requiresDatabaseLookup([])).toBe(false);
    });

    test("returns false for filters on allowlisted columns only", () => {
      expect(
        requiresDatabaseLookup([
          { column: "Name", type: "string", operator: "=", value: "test" },
          {
            column: "Environment",
            type: "string",
            operator: "=",
            value: "production",
          },
        ]),
      ).toBe(false);
    });

    test("returns false for input filter", () => {
      expect(
        requiresDatabaseLookup([
          {
            column: "Input",
            type: "string",
            operator: "contains",
            value: "capital",
          },
        ]),
      ).toBe(false);
    });

    test("returns false for output filter", () => {
      expect(
        requiresDatabaseLookup([
          {
            column: "Output",
            type: "string",
            operator: "contains",
            value: "Paris",
          },
        ]),
      ).toBe(false);
    });

    test("returns false for combined input/output/other allowlisted filters", () => {
      expect(
        requiresDatabaseLookup([
          {
            column: "Input",
            type: "string",
            operator: "contains",
            value: "capital",
          },
          {
            column: "Output",
            type: "string",
            operator: "contains",
            value: "Paris",
          },
          {
            column: "Environment",
            type: "string",
            operator: "=",
            value: "production",
          },
        ]),
      ).toBe(false);
    });

    test("returns true for filters on non-allowlisted columns", () => {
      // Assuming "Latency" is not in the allowlist
      expect(
        requiresDatabaseLookup([
          {
            column: "Latency (s)",
            type: "number",
            operator: ">",
            value: 1000,
          },
        ]),
      ).toBe(true);
    });

    test("returns true when mixing allowlisted and non-allowlisted columns", () => {
      expect(
        requiresDatabaseLookup([
          {
            column: "Input",
            type: "string",
            operator: "contains",
            value: "test",
          },
          {
            column: "Latency (s)",
            type: "number",
            operator: ">",
            value: 1000,
          },
        ]),
      ).toBe(true);
    });
  });
});
