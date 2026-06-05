import { describe, it, expect } from "vitest";
import type { IngestionEventType } from "@langfuse/shared/src/server";
import { groupObservationsByEntity } from "../otelIngestionQueue";

describe("groupObservationsByEntity", () => {
  describe("grouping by entity ID", () => {
    it("groups multiple events for the same observation entity", () => {
      const observations = [
        {
          id: "event-1",
          type: "observation-create",
          timestamp: "2024-01-01T00:00:00Z",
          body: { id: "obs-123", type: "GENERATION", name: "openai-call" },
        },
        {
          id: "event-2",
          type: "observation-update",
          timestamp: "2024-01-01T00:00:01Z",
          body: { id: "obs-123", type: "GENERATION", output: "response text" },
        },
        {
          id: "event-3",
          type: "observation-update",
          timestamp: "2024-01-01T00:00:02Z",
          body: {
            id: "obs-123",
            type: "GENERATION",
            endTime: "2024-01-01T00:00:02Z",
          },
        },
      ] as IngestionEventType[];

      const result = groupObservationsByEntity(observations);

      expect(Object.keys(result)).toHaveLength(1);
      const group = Object.values(result)[0];
      expect(group).toHaveLength(3);
      expect(group).toEqual(observations);
    });

    it("creates separate groups for different observation entities", () => {
      const observations = [
        {
          id: "event-1",
          type: "observation-create",
          timestamp: "2024-01-01T00:00:00Z",
          body: { id: "obs-123", type: "GENERATION" },
        },
        {
          id: "event-2",
          type: "observation-create",
          timestamp: "2024-01-01T00:00:01Z",
          body: { id: "obs-456", type: "SPAN" },
        },
        {
          id: "event-3",
          type: "observation-update",
          timestamp: "2024-01-01T00:00:02Z",
          body: { id: "obs-123", type: "GENERATION", output: "response" },
        },
      ] as IngestionEventType[];

      const result = groupObservationsByEntity(observations);

      expect(Object.keys(result)).toHaveLength(2);
      const groups = Object.values(result);
      const obs123 = groups.find((g) => g[0].body.id === "obs-123");
      const obs456 = groups.find((g) => g[0].body.id === "obs-456");
      expect(obs123).toHaveLength(2);
      expect(obs456).toHaveLength(1);
    });

    it("preserves event order within each entity group", () => {
      const observations = [
        {
          id: "event-1",
          type: "observation-create",
          timestamp: "2024-01-01T00:00:00Z",
          body: { id: "obs-123", sequence: 1 } as any,
        },
        {
          id: "event-2",
          type: "observation-update",
          timestamp: "2024-01-01T00:00:01Z",
          body: { id: "obs-456", sequence: 1 } as any,
        },
        {
          id: "event-3",
          type: "observation-update",
          timestamp: "2024-01-01T00:00:02Z",
          body: { id: "obs-123", sequence: 2 } as any,
        },
        {
          id: "event-4",
          type: "observation-update",
          timestamp: "2024-01-01T00:00:03Z",
          body: { id: "obs-123", sequence: 3 } as any,
        },
      ] as IngestionEventType[];

      const result = groupObservationsByEntity(observations);
      const groups = Object.values(result);
      const obs123 = groups.find((g) => g[0].body.id === "obs-123")!;

      expect(obs123[0].body.sequence).toBe(1);
      expect(obs123[1].body.sequence).toBe(2);
      expect(obs123[2].body.sequence).toBe(3);
    });

    it("uses composite key (type + id) so same ID with different entity types stays separate", () => {
      const observations = [
        {
          id: "event-1",
          type: "observation-create",
          timestamp: "2024-01-01T00:00:00Z",
          body: { id: "shared-id", type: "GENERATION" },
        },
        {
          id: "event-2",
          type: "span-create",
          timestamp: "2024-01-01T00:00:01Z",
          body: { id: "shared-id", type: "SPAN" },
        },
      ] as IngestionEventType[];

      const result = groupObservationsByEntity(observations);

      // Same body.id but different clickhouse entity types → separate groups
      expect(Object.keys(result)).toHaveLength(2);
    });
  });

  describe("read amplification reduction", () => {
    it("reduces mergeAndWrite calls from N events to unique-entity count", () => {
      const uniqueEntityIds = Array.from({ length: 10 }, (_, i) => `obs-${i}`);
      const observations = Array.from({ length: 100 }, (_, i) => ({
        id: `event-${i}`,
        type: "observation-update",
        timestamp: new Date().toISOString(),
        body: { id: uniqueEntityIds[i % 10], type: "GENERATION" },
      })) as IngestionEventType[];

      const result = groupObservationsByEntity(observations);

      // Without batching: 100 calls. With batching: 10 calls (one per entity).
      expect(Object.keys(result)).toHaveLength(10);

      // No events are lost
      const total = Object.values(result).reduce((sum, g) => sum + g.length, 0);
      expect(total).toBe(100);
    });
  });

  describe("edge cases", () => {
    it("returns empty object for empty input", () => {
      expect(groupObservationsByEntity([])).toEqual({});
    });

    it("handles a single observation with a single event", () => {
      const observations = [
        {
          id: "event-1",
          type: "observation-create",
          timestamp: "2024-01-01T00:00:00Z",
          body: { id: "obs-123", type: "GENERATION" },
        },
      ] as IngestionEventType[];

      const result = groupObservationsByEntity(observations);

      expect(Object.keys(result)).toHaveLength(1);
      expect(Object.values(result)[0]).toHaveLength(1);
    });

    it("handles all-different entities without losing events", () => {
      const observations = Array.from({ length: 10 }, (_, i) => ({
        id: `event-${i}`,
        type: "observation-create",
        timestamp: new Date().toISOString(),
        body: { id: `obs-${i}`, type: "GENERATION" },
      })) as IngestionEventType[];

      const result = groupObservationsByEntity(observations);

      expect(Object.keys(result)).toHaveLength(10);
      Object.values(result).forEach((events) => expect(events).toHaveLength(1));
    });
  });
});
