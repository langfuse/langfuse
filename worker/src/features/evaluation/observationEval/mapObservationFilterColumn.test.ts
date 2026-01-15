import { describe, it, expect } from "vitest";
import { mapObservationFilterColumn } from "./mapObservationFilterColumn";
import { type ObservationEvent } from "./types";

describe("mapObservationFilterColumn", () => {
  const mockObservation: ObservationEvent = {
    projectId: "project-789",
    traceId: "trace-456",
    spanId: "obs-123",
    startTimeISO: new Date().toISOString(),
    endTimeISO: new Date().toISOString(),
    type: "generation",
    name: "chat-completion",
    environment: "production",
    version: "v1.0",
    release: "v2.0.0",
    level: "DEFAULT",
    statusMessage: undefined,
    modelName: "gpt-4",
    modelId: "model-123",
    modelParameters: { temperature: 0.7 },
    input: '{"prompt": "Hello"}',
    output: '{"response": "World"}',
    metadata: { key1: "value1", key2: "value2" },
    userId: "user-abc",
    sessionId: "session-xyz",
    tags: ["tag1", "tag2"],
    providedUsageDetails: {},
    usageDetails: { input: 100, output: 50 },
    providedCostDetails: {},
    costDetails: {},
    source: "otel",
  };

  describe("observation-level fields", () => {
    it("should map 'type' column correctly", () => {
      expect(
        mapObservationFilterColumn({
          observation: mockObservation,
          columnId: "type",
        }),
      ).toBe("generation");
    });

    it("should map 'name' column correctly", () => {
      expect(
        mapObservationFilterColumn({
          observation: mockObservation,
          columnId: "name",
        }),
      ).toBe("chat-completion");
    });

    it("should map 'model' column to modelName", () => {
      expect(
        mapObservationFilterColumn({
          observation: mockObservation,
          columnId: "model",
        }),
      ).toBe("gpt-4");
    });

    it("should map 'level' column correctly", () => {
      expect(
        mapObservationFilterColumn({
          observation: mockObservation,
          columnId: "level",
        }),
      ).toBe("DEFAULT");
    });

    it("should map 'metadata' column correctly", () => {
      expect(
        mapObservationFilterColumn({
          observation: mockObservation,
          columnId: "metadata",
        }),
      ).toEqual({ key1: "value1", key2: "value2" });
    });
  });

  describe("trace-level fields (from OTEL attributes)", () => {
    it("should map 'trace_name' column to observation name (in OTEL trace name comes from span)", () => {
      expect(
        mapObservationFilterColumn({
          observation: mockObservation,
          columnId: "trace_name",
        }),
      ).toBe("chat-completion");
    });

    it("should map 'user_id' column correctly", () => {
      expect(
        mapObservationFilterColumn({
          observation: mockObservation,
          columnId: "user_id",
        }),
      ).toBe("user-abc");
    });

    it("should map 'session_id' column correctly", () => {
      expect(
        mapObservationFilterColumn({
          observation: mockObservation,
          columnId: "session_id",
        }),
      ).toBe("session-xyz");
    });

    it("should map 'tags' column correctly", () => {
      expect(
        mapObservationFilterColumn({
          observation: mockObservation,
          columnId: "tags",
        }),
      ).toEqual(["tag1", "tag2"]);
    });

    it("should map 'release' column correctly", () => {
      expect(
        mapObservationFilterColumn({
          observation: mockObservation,
          columnId: "release",
        }),
      ).toBe("v2.0.0");
    });
  });

  describe("null/undefined handling", () => {
    const observationWithUndefined: ObservationEvent = {
      ...mockObservation,
      name: undefined,
      modelName: undefined,
      userId: undefined,
      sessionId: undefined,
      tags: undefined,
      release: undefined,
    };

    it("should return undefined for undefined fields", () => {
      expect(
        mapObservationFilterColumn({
          observation: observationWithUndefined,
          columnId: "name",
        }),
      ).toBeUndefined();

      expect(
        mapObservationFilterColumn({
          observation: observationWithUndefined,
          columnId: "model",
        }),
      ).toBeUndefined();

      expect(
        mapObservationFilterColumn({
          observation: observationWithUndefined,
          columnId: "user_id",
        }),
      ).toBeUndefined();
    });

    it("should return undefined for unknown columns", () => {
      expect(
        mapObservationFilterColumn({
          observation: mockObservation,
          columnId: "unknown_column",
        }),
      ).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should handle empty metadata", () => {
      const obsWithEmptyMetadata = { ...mockObservation, metadata: {} };
      expect(
        mapObservationFilterColumn({
          observation: obsWithEmptyMetadata,
          columnId: "metadata",
        }),
      ).toEqual({});
    });

    it("should handle empty tags array", () => {
      const obsWithEmptyTags = { ...mockObservation, tags: [] };
      expect(
        mapObservationFilterColumn({
          observation: obsWithEmptyTags,
          columnId: "tags",
        }),
      ).toEqual([]);
    });
  });
});
