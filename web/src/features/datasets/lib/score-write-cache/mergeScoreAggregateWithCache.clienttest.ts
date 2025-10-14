import { mergeScoreAggregateWithCache } from "@/src/features/datasets/lib/score-write-cache/mergeScoreAggregateWithCache";
import { type ScoreColumn } from "@/src/features/scores/types";
import { type ScoreAggregate } from "@langfuse/shared";

describe("mergeScoreAggregateWithCache", () => {
  const mockCache = {
    creates: new Map(),
    updates: new Map(),
    deletes: new Set() as Set<string>,
    scoreColumns: [] as ScoreColumn[],
    cacheCreate: jest.fn(),
    cacheUpdate: jest.fn(),
    cacheDelete: jest.fn(),
    clearWrites: jest.fn(),
  };

  const mockScoreColumns: ScoreColumn[] = [
    {
      key: "accuracy-ANNOTATION",
      name: "accuracy",
      source: "ANNOTATION",
      dataType: "NUMERIC",
    },
    {
      key: "relevance-ANNOTATION",
      name: "relevance",
      source: "ANNOTATION",
      dataType: "NUMERIC",
    },
    {
      key: "quality-ANNOTATION",
      name: "quality",
      source: "ANNOTATION",
      dataType: "CATEGORICAL",
    },
    {
      key: "quality-ANNOTATION",
      name: "quality",
      source: "ANNOTATION",
      dataType: "CATEGORICAL",
    },
  ];

  beforeEach(() => {
    mockCache.creates.clear();
    mockCache.updates.clear();
    mockCache.deletes.clear();
  });

  describe("updates", () => {
    it("should overlay updated score values from cache", () => {
      const aggregate: ScoreAggregate = {
        "accuracy-ANNOTATION": {
          id: "score-123",
          type: "NUMERIC",
          values: [0.8],
          average: 0.8,
          comment: "old comment",
          hasMetadata: false,
        },
      };

      mockCache.updates.set("score-123", {
        name: "accuracy",
        dataType: "NUMERIC",
        configId: "config-accuracy",
        traceId: "trace-1",
        observationId: "obs-1",
        value: 0.95,
        stringValue: null,
        comment: "updated comment",
      });

      const result = mergeScoreAggregateWithCache(
        aggregate,
        mockCache.creates,
        mockCache.updates,
        mockCache.deletes,
        "trace-1",
        "obs-1",
        mockScoreColumns,
      );

      expect(result["accuracy-ANNOTATION"]).toEqual({
        id: "score-123",
        type: "NUMERIC",
        values: [0.95],
        average: 0.95,
        comment: "updated comment",
        hasMetadata: false,
      });
    });

    it("should handle categorical score updates with stringValue", () => {
      const aggregate: ScoreAggregate = {
        "quality-ANNOTATION": {
          id: "score-456",
          type: "CATEGORICAL",
          values: ["good"],
          valueCounts: [{ value: "good", count: 1 }],
          comment: null,
          hasMetadata: false,
        },
      };

      mockCache.updates.set("score-456", {
        name: "quality",
        dataType: "CATEGORICAL",
        configId: "config-quality",
        traceId: "trace-2",
        observationId: undefined,
        value: null,
        stringValue: "excellent",
        comment: "much better",
      });

      const result = mergeScoreAggregateWithCache(
        aggregate,
        mockCache.creates,
        mockCache.updates,
        mockCache.deletes,
        "trace-2",
        undefined,
        mockScoreColumns,
      );

      expect(result["quality-ANNOTATION"].values[0]).toBe("excellent");
      expect(result["quality-ANNOTATION"].comment).toBe("much better");
    });
  });

  describe("deletes", () => {
    it("should remove deleted scores from aggregate", () => {
      const aggregate: ScoreAggregate = {
        "accuracy-ANNOTATION": {
          id: "score-to-delete",
          type: "NUMERIC",
          values: [0.9],
          average: 0.9,
          comment: null,
          hasMetadata: false,
        },
        "relevance-ANNOTATION": {
          id: "score-keep",
          type: "NUMERIC",
          values: [0.8],
          average: 0.8,
          comment: null,
          hasMetadata: false,
        },
      };

      mockCache.deletes.add("score-to-delete");

      const result = mergeScoreAggregateWithCache(
        aggregate,
        mockCache.creates,
        mockCache.updates,
        mockCache.deletes,
        "trace-4",
        "obs-4",
        mockScoreColumns,
      );

      expect(result["accuracy-ANNOTATION"]).toBeUndefined();
      expect(result["relevance-ANNOTATION"]).toBeDefined();
    });

    it("should delete before checking for updates", () => {
      const aggregate: ScoreAggregate = {
        "accuracy-ANNOTATION": {
          id: "score-deleted",
          type: "NUMERIC",
          values: [0.9],
          average: 0.9,
          comment: null,
          hasMetadata: false,
        },
      };

      mockCache.deletes.add("score-deleted");
      mockCache.updates.set("score-deleted", {
        name: "accuracy",
        dataType: "NUMERIC",
        configId: "config-accuracy",
        traceId: "trace-5",
        observationId: "obs-5",
        value: 0.95,
        stringValue: null,
        comment: null,
      });

      const result = mergeScoreAggregateWithCache(
        aggregate,
        mockCache.creates,
        mockCache.updates,
        mockCache.deletes,
        "trace-5",
        "obs-5",
        mockScoreColumns,
      );

      expect(result["accuracy-ANNOTATION"]).toBeUndefined();
    });
  });

  describe("creates", () => {
    it("should add new score from cache when no aggregate exists", () => {
      const aggregate: ScoreAggregate = {};

      mockCache.creates.set("new-score-id", {
        name: "accuracy",
        dataType: "NUMERIC",
        configId: "config-accuracy",
        traceId: "trace-6",
        observationId: "obs-6",
        value: 0.88,
        stringValue: null,
        comment: "new score",
      });

      const result = mergeScoreAggregateWithCache(
        aggregate,
        mockCache.creates,
        mockCache.updates,
        mockCache.deletes,
        "trace-6",
        "obs-6",
        mockScoreColumns,
      );

      expect(result["accuracy-ANNOTATION"].id).toBe("new-score-id");
      expect(result["accuracy-ANNOTATION"].values[0]).toBe(0.88);
      expect(result["accuracy-ANNOTATION"].comment).toBe("new score");
    });

    it("should match creates by traceId, observationId, name, and dataType", () => {
      const aggregate: ScoreAggregate = {};

      mockCache.creates.set("score-acc", {
        name: "accuracy",
        dataType: "NUMERIC",
        configId: "config-accuracy",
        traceId: "trace-7",
        observationId: "obs-7",
        value: 0.9,
        stringValue: null,
        comment: null,
      });

      mockCache.creates.set("score-rel-wrong-trace", {
        name: "relevance",
        dataType: "NUMERIC",
        configId: "config-relevance",
        traceId: "different-trace",
        observationId: "obs-7",
        value: 0.8,
        stringValue: null,
        comment: null,
      });

      const result = mergeScoreAggregateWithCache(
        aggregate,
        mockCache.creates,
        mockCache.updates,
        mockCache.deletes,
        "trace-7",
        "obs-7",
        mockScoreColumns,
      );

      expect(result["accuracy-ANNOTATION"].id).toBe("score-acc");
      expect(result["relevance-ANNOTATION"]).toBeUndefined();
    });

    it("should handle creates with undefined observationId (trace-level)", () => {
      const aggregate: ScoreAggregate = {};

      mockCache.creates.set("trace-score", {
        name: "accuracy",
        dataType: "NUMERIC",
        configId: "config-accuracy",
        traceId: "trace-8",
        observationId: undefined,
        value: 0.92,
        stringValue: null,
        comment: "trace score",
      });

      const result = mergeScoreAggregateWithCache(
        aggregate,
        mockCache.creates,
        mockCache.updates,
        mockCache.deletes,
        "trace-8",
        undefined,
        mockScoreColumns,
      );

      expect(result["accuracy-ANNOTATION"].id).toBe("trace-score");
      expect(result["accuracy-ANNOTATION"].values[0]).toBe(0.92);
    });
  });

  describe("mixed operations", () => {
    it("should handle updates, creates, and deletes in same merge", () => {
      const aggregate: ScoreAggregate = {
        "accuracy-ANNOTATION": {
          id: "existing-to-update",
          type: "NUMERIC",
          values: [0.7],
          average: 0.7,
          comment: null,
          hasMetadata: false,
        },
        "quality-ANNOTATION": {
          id: "existing-to-delete",
          type: "CATEGORICAL",
          values: ["good"],
          valueCounts: [{ value: "good", count: 1 }],
          comment: null,
          hasMetadata: false,
        },
      };

      mockCache.updates.set("existing-to-update", {
        name: "accuracy",
        dataType: "NUMERIC",
        configId: "config-accuracy",
        traceId: "trace-10",
        observationId: "obs-10",
        value: 0.95,
        stringValue: null,
        comment: "updated",
      });

      mockCache.creates.set("newly-created", {
        name: "relevance",
        dataType: "NUMERIC",
        configId: "config-relevance",
        traceId: "trace-10",
        observationId: "obs-10",
        value: 0.88,
        stringValue: null,
        comment: "created",
      });

      mockCache.deletes.add("existing-to-delete");

      const result = mergeScoreAggregateWithCache(
        aggregate,
        mockCache.creates,
        mockCache.updates,
        mockCache.deletes,
        "trace-10",
        "obs-10",
        mockScoreColumns,
      );

      expect(result["accuracy-ANNOTATION"].values[0]).toBe(0.95);
      expect(result["relevance-ANNOTATION"].id).toBe("newly-created");
      expect(result["quality-ANNOTATION"]).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should handle empty aggregate", () => {
      const result = mergeScoreAggregateWithCache(
        {},
        mockCache.creates,
        mockCache.updates,
        mockCache.deletes,
        "trace-14",
        "obs-14",
        mockScoreColumns,
      );

      expect(result).toEqual({});
    });

    it("should not mutate original aggregate", () => {
      const aggregate: ScoreAggregate = {
        "accuracy-ANNOTATION": {
          id: "score-immutable",
          type: "NUMERIC",
          values: [0.8],
          average: 0.8,
          comment: null,
          hasMetadata: false,
        },
      };

      const originalAggregate = JSON.parse(JSON.stringify(aggregate));

      mockCache.updates.set("score-immutable", {
        name: "accuracy",
        dataType: "NUMERIC",
        configId: "config-accuracy",
        traceId: "trace-16",
        observationId: "obs-16",
        value: 0.95,
        stringValue: null,
        comment: null,
      });

      mergeScoreAggregateWithCache(
        aggregate,
        mockCache.creates,
        mockCache.updates,
        mockCache.deletes,
        "trace-16",
        "obs-16",
        mockScoreColumns,
      );

      expect(aggregate).toEqual(originalAggregate);
    });

    it("should apply update on top of create (create + update)", () => {
      const aggregate: ScoreAggregate = {};

      mockCache.creates.set("score-created-then-updated", {
        name: "accuracy",
        dataType: "NUMERIC",
        configId: "config-accuracy",
        traceId: "trace-17",
        observationId: "obs-17",
        value: 0.7,
        stringValue: null,
        comment: "initial value",
      });

      mockCache.updates.set("score-created-then-updated", {
        name: "accuracy",
        dataType: "NUMERIC",
        configId: "config-accuracy",
        traceId: "trace-17",
        observationId: "obs-17",
        value: 0.95,
        stringValue: null,
        comment: "updated value",
      });

      const result = mergeScoreAggregateWithCache(
        aggregate,
        mockCache.creates,
        mockCache.updates,
        mockCache.deletes,
        "trace-17",
        "obs-17",
        mockScoreColumns,
      );

      // Should use the updated value, not the created value
      expect(result["accuracy-ANNOTATION"].id).toBe(
        "score-created-then-updated",
      );
      expect(result["accuracy-ANNOTATION"].values[0]).toBe(0.95);
      expect(result["accuracy-ANNOTATION"].comment).toBe("updated value");
    });

    it("should delete score even if it has an update (update + delete)", () => {
      const aggregate: ScoreAggregate = {
        "accuracy-ANNOTATION": {
          id: "score-updated-then-deleted",
          type: "NUMERIC",
          values: [0.8],
          average: 0.8,
          comment: null,
          hasMetadata: false,
        },
      };

      mockCache.updates.set("score-updated-then-deleted", {
        name: "accuracy",
        dataType: "NUMERIC",
        configId: "config-accuracy",
        traceId: "trace-18",
        observationId: "obs-18",
        value: 0.95,
        stringValue: null,
        comment: "updated",
      });

      mockCache.deletes.add("score-updated-then-deleted");

      const result = mergeScoreAggregateWithCache(
        aggregate,
        mockCache.creates,
        mockCache.updates,
        mockCache.deletes,
        "trace-18",
        "obs-18",
        mockScoreColumns,
      );

      // Delete should take precedence over update
      expect(result["accuracy-ANNOTATION"]).toBeUndefined();
    });

    it("should show created score after delete (delete + create)", () => {
      const aggregate: ScoreAggregate = {
        "accuracy-ANNOTATION": {
          id: "score-deleted-then-recreated",
          type: "NUMERIC",
          values: [0.8],
          average: 0.8,
          comment: null,
          hasMetadata: false,
        },
      };

      mockCache.deletes.add("score-deleted-then-recreated");

      mockCache.creates.set("score-new-after-delete", {
        name: "accuracy",
        dataType: "NUMERIC",
        configId: "config-accuracy",
        traceId: "trace-19",
        observationId: "obs-19",
        value: 0.92,
        stringValue: null,
        comment: "recreated",
      });

      const result = mergeScoreAggregateWithCache(
        aggregate,
        mockCache.creates,
        mockCache.updates,
        mockCache.deletes,
        "trace-19",
        "obs-19",
        mockScoreColumns,
      );

      // Cached creates have priority - the new create should override the deleted score
      expect(result["accuracy-ANNOTATION"]).toEqual({
        type: "NUMERIC",
        id: "score-new-after-delete",
        values: [0.92],
        average: 0.92,
        comment: "recreated",
        hasMetadata: false,
      });
    });

    it("should show created score in empty slot after deleting different score (delete other + create)", () => {
      const aggregate: ScoreAggregate = {};

      mockCache.deletes.add("some-other-score-id");

      mockCache.creates.set("new-score", {
        name: "accuracy",
        dataType: "NUMERIC",
        configId: "config-accuracy",
        traceId: "trace-20",
        observationId: "obs-20",
        value: 0.88,
        stringValue: null,
        comment: "newly created",
      });

      const result = mergeScoreAggregateWithCache(
        aggregate,
        mockCache.creates,
        mockCache.updates,
        mockCache.deletes,
        "trace-20",
        "obs-20",
        mockScoreColumns,
      );

      // Should show the newly created score
      expect(result["accuracy-ANNOTATION"].id).toBe("new-score");
      expect(result["accuracy-ANNOTATION"].values[0]).toBe(0.88);
    });
  });
});
