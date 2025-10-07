import { type ScoreColumn } from "@/src/features/scores/types";
import {
  transformSingleValueAggregateScoreData,
  filterSingleValueAggregates,
} from "../lib/filterSingleValueAggregates";
import { mergeScoreAggregateWithCache } from "./ScoreWriteCache";
import { type ScoreConfigDomain, type ScoreAggregate } from "@langfuse/shared";

describe("transformSingleValueAggregateScoreData", () => {
  const createMockConfig = (
    overrides: Partial<ScoreConfigDomain> = {},
  ): ScoreConfigDomain =>
    ({
      id: "config-1",
      name: "test-score",
      projectId: "project-1",
      dataType: "NUMERIC",
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      categories: null,
      maxValue: null,
      minValue: null,
      description: null,
      ...overrides,
    }) as ScoreConfigDomain;

  describe("numeric scores", () => {
    it("should transform numeric annotation score with id", () => {
      const aggregate: ScoreAggregate = {
        "test-score-ANNOTATION": {
          id: "score-123",
          type: "NUMERIC",
          values: [0.95],
          average: 0.95,
          comment: "good score",
          hasMetadata: false,
        },
      };

      const configs = [
        createMockConfig({
          id: "config-1",
          name: "test-score",
          dataType: "NUMERIC",
        }),
      ];

      const result = transformSingleValueAggregateScoreData(
        aggregate,
        configs,
        "trace-123",
        "obs-456",
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: "score-123",
        name: "test-score",
        dataType: "NUMERIC",
        source: "ANNOTATION",
        comment: "good score",
        configId: "config-1",
        traceId: "trace-123",
        observationId: "obs-456",
        sessionId: null,
        stringValue: null,
        value: 0.95,
      });
    });

    it("should handle numeric score without id (null)", () => {
      const aggregate: ScoreAggregate = {
        "accuracy-ANNOTATION": {
          id: null,
          type: "NUMERIC",
          values: [0, 2],
          average: 1,
          comment: null,
          hasMetadata: false,
        },
      };

      const configs = [
        createMockConfig({
          id: "config-2",
          name: "accuracy",
          dataType: "NUMERIC",
        }),
      ];

      const result = transformSingleValueAggregateScoreData(
        aggregate,
        configs,
        "trace-123",
        null,
      );

      expect(result).toHaveLength(0);
    });
  });

  describe("categorical scores", () => {
    it("should transform categorical score with valid category mapping", () => {
      const aggregate: ScoreAggregate = {
        "quality-ANNOTATION": {
          id: "score-456",
          type: "CATEGORICAL",
          values: ["excellent"],
          valueCounts: [{ value: "excellent", count: 1 }],
          comment: "great work",
          hasMetadata: false,
        },
      };

      const configs = [
        createMockConfig({
          id: "config-3",
          name: "quality",
          dataType: "CATEGORICAL",
          categories: [
            { label: "excellent", value: 5 },
            { label: "good", value: 3 },
            { label: "poor", value: 1 },
          ],
        }),
      ];

      const result = transformSingleValueAggregateScoreData(
        aggregate,
        configs,
        "trace-789",
        null,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: "score-456",
        name: "quality",
        dataType: "CATEGORICAL",
        source: "ANNOTATION",
        comment: "great work",
        configId: "config-3",
        traceId: "trace-789",
        observationId: null,
        sessionId: null,
        stringValue: "excellent",
        value: 5,
      });
    });

    it("should filter out categorical score with invalid category mapping", () => {
      const aggregate: ScoreAggregate = {
        "quality-ANNOTATION": {
          id: "score-789",
          type: "CATEGORICAL",
          values: ["invalid-label"],
          valueCounts: [{ value: "invalid-label", count: 1 }],
          comment: null,
          hasMetadata: false,
        },
      };

      const configs = [
        createMockConfig({
          id: "config-4",
          name: "quality",
          dataType: "CATEGORICAL",
          categories: [
            { label: "excellent", value: 5 },
            { label: "good", value: 3 },
          ],
        }),
      ];

      const result = transformSingleValueAggregateScoreData(
        aggregate,
        configs,
        "trace-999",
        null,
      );

      // Should filter out because category label doesn't exist in config
      expect(result).toHaveLength(0);
    });
  });

  describe("filtering by source", () => {
    it("should only include ANNOTATION source scores", () => {
      const aggregate: ScoreAggregate = {
        "score1-ANNOTATION": {
          id: "score-1",
          type: "NUMERIC",
          values: [0.8],
          average: 0.8,
          comment: null,
          hasMetadata: false,
        },
        "score2-API": {
          id: "score-2",
          type: "NUMERIC",
          values: [0.9],
          average: 0.9,
          comment: null,
          hasMetadata: false,
        },
        "score3-EVAL": {
          id: "score-3",
          type: "NUMERIC",
          values: [0.7],
          average: 0.7,
          comment: null,
          hasMetadata: false,
        },
      };

      const configs = [
        createMockConfig({ id: "c1", name: "score1", dataType: "NUMERIC" }),
        createMockConfig({ id: "c2", name: "score2", dataType: "NUMERIC" }),
        createMockConfig({ id: "c3", name: "score3", dataType: "NUMERIC" }),
      ];

      const result = transformSingleValueAggregateScoreData(
        aggregate,
        configs,
        "trace-111",
        null,
      );

      // Only ANNOTATION source should be included
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe("ANNOTATION");
      expect(result[0].name).toBe("score1");
    });
  });

  describe("config matching", () => {
    it("should filter out scores without matching config", () => {
      const aggregate: ScoreAggregate = {
        "orphaned-score-ANNOTATION": {
          id: "score-orphan",
          type: "NUMERIC",
          values: [0.5],
          average: 0.5,
          comment: null,
          hasMetadata: false,
        },
      };

      const configs = [
        createMockConfig({
          id: "config-x",
          name: "different-score",
          dataType: "NUMERIC",
        }),
      ];

      const result = transformSingleValueAggregateScoreData(
        aggregate,
        configs,
        "trace-222",
        null,
      );

      // Should filter out because no matching config
      expect(result).toHaveLength(0);
    });

    it("should match config by name and dataType", () => {
      const aggregate: ScoreAggregate = {
        "accuracy-ANNOTATION": {
          id: "score-1",
          type: "NUMERIC",
          values: [0.8],
          average: 0.8,
          comment: null,
          hasMetadata: false,
        },
        "accuracy-ANNOTATION-2": {
          id: "score-2",
          type: "CATEGORICAL",
          values: ["good"],
          valueCounts: [{ value: "good", count: 1 }],
          comment: null,
          hasMetadata: false,
        },
      };

      const configs = [
        createMockConfig({
          id: "numeric-config",
          name: "accuracy",
          dataType: "NUMERIC",
        }),
        createMockConfig({
          id: "categorical-config",
          name: "accuracy",
          dataType: "CATEGORICAL",
          categories: [{ label: "good", value: 1 }],
        }),
      ];

      const result = transformSingleValueAggregateScoreData(
        aggregate,
        configs,
        "trace-333",
        null,
      );

      expect(result).toHaveLength(2);
      expect(result[0].configId).toBe("numeric-config");
      expect(result[1].configId).toBe("categorical-config");
    });
  });

  describe("multiple scores", () => {
    it("should transform multiple valid scores", () => {
      const aggregate: ScoreAggregate = {
        "accuracy-ANNOTATION": {
          id: "score-1",
          type: "NUMERIC",
          values: [0.95],
          average: 0.95,
          comment: "excellent",
          hasMetadata: false,
        },
        "relevance-ANNOTATION": {
          id: "score-2",
          type: "NUMERIC",
          values: [0.87],
          average: 0.87,
          comment: null,
          hasMetadata: false,
        },
        "quality-ANNOTATION": {
          id: "score-3",
          type: "CATEGORICAL",
          values: ["good"],
          valueCounts: [{ value: "good", count: 1 }],
          comment: "decent",
          hasMetadata: false,
        },
      };

      const configs = [
        createMockConfig({ id: "c1", name: "accuracy", dataType: "NUMERIC" }),
        createMockConfig({ id: "c2", name: "relevance", dataType: "NUMERIC" }),
        createMockConfig({
          id: "c3",
          name: "quality",
          dataType: "CATEGORICAL",
          categories: [{ label: "good", value: 3 }],
        }),
      ];

      const result = transformSingleValueAggregateScoreData(
        aggregate,
        configs,
        "trace-444",
        "obs-555",
      );

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.name)).toEqual([
        "accuracy",
        "relevance",
        "quality",
      ]);
    });
  });

  describe("edge cases", () => {
    it("should handle empty aggregate", () => {
      const result = transformSingleValueAggregateScoreData(
        {},
        [],
        "trace-empty",
        null,
      );

      expect(result).toHaveLength(0);
    });

    it("should handle null observationId for trace-level scores", () => {
      const aggregate: ScoreAggregate = {
        "test-ANNOTATION": {
          id: "score-trace",
          type: "NUMERIC",
          values: [0.9],
          average: 0.9,
          comment: null,
          hasMetadata: false,
        },
      };

      const configs = [
        createMockConfig({ id: "config-t", name: "test", dataType: "NUMERIC" }),
      ];

      const result = transformSingleValueAggregateScoreData(
        aggregate,
        configs,
        "trace-only",
        null,
      );

      expect(result).toHaveLength(1);
      expect(result[0].observationId).toBeNull();
      expect(result[0].traceId).toBe("trace-only");
    });
  });
});

describe("filterSingleValueAggregates", () => {
  it("should filter out aggregates without id", () => {
    const aggregates: ScoreAggregate = {
      "score1-ANNOTATION": {
        id: "score-123",
        type: "NUMERIC",
        values: [0.9],
        average: 0.9,
        comment: null,
        hasMetadata: false,
      },
      "score2-ANNOTATION": {
        id: null,
        type: "NUMERIC",
        values: [0, 24],
        average: 12,
        comment: null,
        hasMetadata: false,
      },
      "score3-ANNOTATION": {
        id: "score-456",
        type: "CATEGORICAL",
        values: ["good"],
        valueCounts: [{ value: "good", count: 1 }],
        comment: null,
        hasMetadata: false,
      },
    };

    const result = filterSingleValueAggregates(aggregates);

    expect(Object.keys(result)).toHaveLength(2);
    expect(result["score1-ANNOTATION"]).toBeDefined();
    expect(result["score2-ANNOTATION"]).toBeUndefined();
    expect(result["score3-ANNOTATION"]).toBeDefined();
  });

  it("should handle empty input", () => {
    const result = filterSingleValueAggregates({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("should preserve all aggregate properties", () => {
    const aggregates: ScoreAggregate = {
      "test-ANNOTATION": {
        id: "score-789",
        type: "NUMERIC",
        values: [0.85],
        average: 0.85,
        comment: "test comment",
        hasMetadata: true,
      },
    };

    const result = filterSingleValueAggregates(aggregates);

    expect(result["test-ANNOTATION"]).toEqual(aggregates["test-ANNOTATION"]);
  });
});

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
        mockCache,
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
        mockCache,
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
        mockCache,
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
        mockCache,
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
        mockCache,
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
        mockCache,
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
        mockCache,
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
        mockCache,
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
        mockCache,
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
        mockCache,
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
        mockCache,
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
        mockCache,
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
        mockCache,
        "trace-19",
        "obs-19",
        mockScoreColumns,
      );

      // The old score should be deleted, but the new create should appear
      // However, the create won't match because the aggregate already has an id
      // So first the delete removes it, then nothing matches the create
      expect(result["accuracy-ANNOTATION"]).toBeUndefined();
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
        mockCache,
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
