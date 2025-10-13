// Mock jsonpath-plus ESM module to avoid import issues
jest.mock("jsonpath-plus", () => ({
  JSONPath: jest.fn(),
}));

// Mock aggregateScores functions with actual implementations (they don't use jsonpath)
jest.mock("../../../scores/lib/aggregateScores", () => ({
  normalizeScoreName: (name: string) => name.replaceAll(/[-\.]/g, "_"),
  decomposeAggregateScoreKey: (key: string) => {
    const [name, source, dataType] = key.split("-");
    return { name, source, dataType };
  },
}));

import {
  transformSingleValueAggregateScoreData,
  filterSingleValueAggregates,
} from "./filterSingleValueAggregates";
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
        "test_score-ANNOTATION-NUMERIC": {
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
        name: "test_score",
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
        "accuracy-ANNOTATION-NUMERIC": {
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
        "quality-ANNOTATION-CATEGORICAL": {
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
        "quality-ANNOTATION-CATEGORICAL": {
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
        "score1-ANNOTATION-NUMERIC": {
          id: "score-1",
          type: "NUMERIC",
          values: [0.8],
          average: 0.8,
          comment: null,
          hasMetadata: false,
        },
        "score2-API-NUMERIC": {
          id: "score-2",
          type: "NUMERIC",
          values: [0.9],
          average: 0.9,
          comment: null,
          hasMetadata: false,
        },
        "score3-EVAL-NUMERIC": {
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
        "orphaned-score-ANNOTATION-NUMERIC": {
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
        "accuracy-ANNOTATION-NUMERIC": {
          id: "score-1",
          type: "NUMERIC",
          values: [0.8],
          average: 0.8,
          comment: null,
          hasMetadata: false,
        },
        "accuracy-ANNOTATION-CATEGORICAL": {
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
        "accuracy-ANNOTATION-NUMERIC": {
          id: "score-1",
          type: "NUMERIC",
          values: [0.95],
          average: 0.95,
          comment: "excellent",
          hasMetadata: false,
        },
        "relevance-ANNOTATION-NUMERIC": {
          id: "score-2",
          type: "NUMERIC",
          values: [0.87],
          average: 0.87,
          comment: null,
          hasMetadata: false,
        },
        "quality-ANNOTATION-CATEGORICAL": {
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
        "test-ANNOTATION-NUMERIC": {
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

  it("should filter out aggregates without id and return disabled config IDs", () => {
    const aggregates: ScoreAggregate = {
      "score1-ANNOTATION-NUMERIC": {
        id: "score-123",
        type: "NUMERIC",
        values: [0.9],
        average: 0.9,
        comment: null,
        hasMetadata: false,
      },
      "score2-ANNOTATION-NUMERIC": {
        id: null,
        type: "NUMERIC",
        values: [0, 24],
        average: 12,
        comment: null,
        hasMetadata: false,
      },
      "score3-ANNOTATION-CATEGORICAL": {
        id: "score-456",
        type: "CATEGORICAL",
        values: ["good"],
        valueCounts: [{ value: "good", count: 1 }],
        comment: null,
        hasMetadata: false,
      },
    };

    const configs = [
      createMockConfig({ id: "c1", name: "score1", dataType: "NUMERIC" }),
      createMockConfig({ id: "c2", name: "score2", dataType: "NUMERIC" }),
      createMockConfig({
        id: "c3",
        name: "score3",
        dataType: "CATEGORICAL",
      }),
    ];

    const { filtered, disabledConfigIds } = filterSingleValueAggregates(
      aggregates,
      configs,
    );

    expect(Object.keys(filtered)).toHaveLength(2);
    expect(filtered["score1-ANNOTATION-NUMERIC"]).toBeDefined();
    expect(filtered["score2-ANNOTATION-NUMERIC"]).toBeUndefined();
    expect(filtered["score3-ANNOTATION-CATEGORICAL"]).toBeDefined();

    expect(disabledConfigIds.size).toBe(1);
    expect(disabledConfigIds.has("c2")).toBe(true);
  });

  it("should handle empty input", () => {
    const { filtered, disabledConfigIds } = filterSingleValueAggregates({}, []);
    expect(Object.keys(filtered)).toHaveLength(0);
    expect(disabledConfigIds.size).toBe(0);
  });

  it("should preserve all aggregate properties", () => {
    const aggregates: ScoreAggregate = {
      "test-ANNOTATION-NUMERIC": {
        id: "score-789",
        type: "NUMERIC",
        values: [0.85],
        average: 0.85,
        comment: "test comment",
        hasMetadata: true,
      },
    };

    const configs = [
      createMockConfig({ id: "config-t", name: "test", dataType: "NUMERIC" }),
    ];

    const { filtered } = filterSingleValueAggregates(aggregates, configs);

    expect(filtered["test-ANNOTATION-NUMERIC"]).toEqual(
      aggregates["test-ANNOTATION-NUMERIC"],
    );
  });

  it("should not add config to disabled set if no matching config found", () => {
    const aggregates: ScoreAggregate = {
      "orphaned-ANNOTATION-NUMERIC": {
        id: null,
        type: "NUMERIC",
        values: [1, 2],
        average: 1.5,
        comment: null,
        hasMetadata: false,
      },
    };

    const configs = [
      createMockConfig({ id: "c1", name: "different", dataType: "NUMERIC" }),
    ];

    const { filtered, disabledConfigIds } = filterSingleValueAggregates(
      aggregates,
      configs,
    );

    expect(Object.keys(filtered)).toHaveLength(0);
    expect(disabledConfigIds.size).toBe(0);
  });
});
