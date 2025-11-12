import { transformToAnnotationScores } from "@/src/features/scores/lib/transformScores";
import {
  type ScoreDomain,
  type ScoreAggregate,
  type ScoreConfigDomain,
} from "@langfuse/shared";

const mockConfigs: ScoreConfigDomain[] = [
  {
    id: "config-1",
    name: "quality",
    dataType: "NUMERIC",
    minValue: 0,
    maxValue: 10,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    projectId: "project-1",
  },
  {
    id: "config-2",
    name: "sentiment",
    dataType: "CATEGORICAL",
    categories: [
      { label: "positive", value: 1 },
      { label: "negative", value: 0 },
    ],
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    projectId: "project-1",
  },
];

describe("transformToAnnotationScores - flat scores", () => {
  it("should transform flat annotation scores correctly", () => {
    const flatScores: ScoreDomain[] = [
      {
        id: "score-1",
        name: "quality",
        source: "ANNOTATION",
        dataType: "NUMERIC",
        value: 8,
        stringValue: null,
        configId: "config-1",
        comment: "Good quality",
        traceId: "trace-1",
        observationId: null,
        sessionId: null,
        projectId: "project-1",
        environment: "production",
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        authorUserId: "user-1",
        queueId: null,
        datasetRunId: null,
        executionTraceId: null,
        metadata: {},
      },
      {
        id: "score-2",
        name: "sentiment",
        source: "ANNOTATION",
        dataType: "CATEGORICAL",
        value: 1,
        stringValue: "positive",
        configId: "config-2",
        comment: null,
        traceId: "trace-1",
        observationId: null,
        sessionId: null,
        projectId: "project-1",
        environment: "production",
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        authorUserId: "user-1",
        queueId: null,
        datasetRunId: null,
        executionTraceId: null,
        metadata: {},
      },
    ];

    const result = transformToAnnotationScores(flatScores, mockConfigs);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "score-1",
      name: "quality",
      dataType: "NUMERIC",
      source: "ANNOTATION",
      configId: "config-1",
      value: 8,
      stringValue: null,
      comment: "Good quality",
      traceId: "trace-1",
      observationId: null,
      sessionId: null,
      timestamp: expect.any(Date),
    });
    expect(result[1]).toEqual({
      id: "score-2",
      name: "sentiment",
      dataType: "CATEGORICAL",
      source: "ANNOTATION",
      configId: "config-2",
      value: 1,
      stringValue: "positive",
      comment: null,
      traceId: "trace-1",
      observationId: null,
      sessionId: null,
      timestamp: expect.any(Date),
    });
  });

  it("should filter out non-ANNOTATION scores", () => {
    const flatScores: ScoreDomain[] = [
      {
        id: "score-1",
        name: "quality",
        source: "API",
        dataType: "NUMERIC",
        value: 8,
        stringValue: null,
        configId: "config-1",
        comment: null,
        traceId: "trace-1",
        observationId: null,
        sessionId: null,
        projectId: "project-1",
        environment: "production",
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        authorUserId: null,
        queueId: null,
        datasetRunId: null,
        executionTraceId: null,
        metadata: {},
      },
      {
        id: "score-2",
        name: "sentiment",
        source: "ANNOTATION",
        dataType: "CATEGORICAL",
        value: 1,
        stringValue: "positive",
        configId: "config-2",
        comment: null,
        traceId: "trace-1",
        observationId: null,
        sessionId: null,
        projectId: "project-1",
        environment: "production",
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        authorUserId: "user-1",
        queueId: null,
        datasetRunId: null,
        executionTraceId: null,
        metadata: {},
      },
    ];

    const result = transformToAnnotationScores(flatScores, mockConfigs);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("sentiment");
    expect(result[0]?.source).toBe("ANNOTATION");
  });

  it("should filter out scores without matching config", () => {
    const flatScores: ScoreDomain[] = [
      {
        id: "score-1",
        name: "unknown",
        source: "ANNOTATION",
        dataType: "NUMERIC",
        value: 8,
        stringValue: null,
        configId: "config-99",
        comment: null,
        traceId: "trace-1",
        observationId: null,
        sessionId: null,
        projectId: "project-1",
        environment: "production",
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        authorUserId: "user-1",
        queueId: null,
        datasetRunId: null,
        executionTraceId: null,
        metadata: {},
      },
    ];

    const result = transformToAnnotationScores(flatScores, mockConfigs);

    expect(result).toHaveLength(0);
  });

  it("should handle empty array", () => {
    const result = transformToAnnotationScores([], mockConfigs);
    expect(result).toEqual([]);
  });
});

describe("transformToAnnotationScores - aggregates", () => {
  it("should transform single-value numeric aggregate correctly", () => {
    const aggregates: ScoreAggregate = {
      "quality-ANNOTATION-NUMERIC": {
        id: "score-1",
        type: "NUMERIC",
        values: [8],
        average: 8,
        comment: "Good quality",
        timestamp: new Date(),
      },
    };

    const result = transformToAnnotationScores(
      aggregates,
      mockConfigs,
      "trace-1",
      "obs-1",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "score-1",
      name: "quality",
      dataType: "NUMERIC",
      source: "ANNOTATION",
      configId: "config-1",
      value: 8,
      stringValue: null,
      comment: "Good quality",
      traceId: "trace-1",
      observationId: "obs-1",
      sessionId: null,
      timestamp: expect.any(Date),
    });
  });

  it("should transform single-value categorical aggregate correctly", () => {
    const aggregates: ScoreAggregate = {
      "sentiment-ANNOTATION-CATEGORICAL": {
        id: "score-2",
        type: "CATEGORICAL",
        values: ["positive"],
        valueCounts: [{ value: "positive", count: 1 }],
        timestamp: new Date(),
        comment: null,
      },
    };

    const result = transformToAnnotationScores(
      aggregates,
      mockConfigs,
      "trace-1",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "score-2",
      name: "sentiment",
      dataType: "CATEGORICAL",
      source: "ANNOTATION",
      configId: "config-2",
      value: null,
      stringValue: "positive",
      comment: null,
      traceId: "trace-1",
      observationId: null,
      sessionId: null,
      timestamp: expect.any(Date),
    });
  });

  it("should skip multi-value aggregates (no id)", () => {
    const aggregates: ScoreAggregate = {
      "quality-ANNOTATION-NUMERIC": {
        // No id - multi-value aggregate
        type: "NUMERIC",
        values: [8, 9, 7],
        average: 8,
        comment: null,
      },
    };

    const result = transformToAnnotationScores(
      aggregates,
      mockConfigs,
      "trace-1",
    );

    expect(result).toHaveLength(0);
  });

  it("should skip non-ANNOTATION source aggregates", () => {
    const aggregates: ScoreAggregate = {
      "quality-API-NUMERIC": {
        id: "score-1",
        type: "NUMERIC",
        values: [8],
        average: 8,
        comment: null,
      },
    };

    const result = transformToAnnotationScores(
      aggregates,
      mockConfigs,
      "trace-1",
    );

    expect(result).toHaveLength(0);
  });

  it("should skip aggregates without matching config", () => {
    const aggregates: ScoreAggregate = {
      "unknown-ANNOTATION-NUMERIC": {
        id: "score-1",
        type: "NUMERIC",
        values: [8],
        average: 8,
        comment: null,
      },
    };

    const result = transformToAnnotationScores(
      aggregates,
      mockConfigs,
      "trace-1",
    );

    expect(result).toHaveLength(0);
  });

  it("should handle empty aggregates", () => {
    const result = transformToAnnotationScores({}, mockConfigs, "trace-1");
    expect(result).toEqual([]);
  });
});
