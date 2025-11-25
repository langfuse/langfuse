import {
  mergeScoresWithCache,
  mergeAggregatesWithCache,
  mergeAnnotationScoresWithCache,
} from "@/src/features/scores/lib/mergeScoresWithCache";
import { type ScoreDomain, type ScoreAggregate } from "@langfuse/shared";
import { type CachedScore } from "@/src/features/scores/contexts/ScoreCacheContext";
import { type AnnotationScore } from "@/src/features/scores/types";

describe("mergeScoresWithCache", () => {
  it("should return server scores when cache is empty", () => {
    const serverScores: ScoreDomain[] = [
      {
        id: "score-1",
        name: "quality",
        source: "ANNOTATION",
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
        authorUserId: "user-1",
        queueId: null,
        datasetRunId: null,
        metadata: {},
        executionTraceId: null,
      },
    ];

    const result = mergeScoresWithCache(serverScores, [], new Set());

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("score-1");
  });

  it("should filter out deleted server scores", () => {
    const serverScores: ScoreDomain[] = [
      {
        id: "score-1",
        name: "quality",
        source: "ANNOTATION",
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
        authorUserId: "user-1",
        queueId: null,
        datasetRunId: null,
        metadata: {},
        executionTraceId: null,
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
        metadata: {},
        executionTraceId: null,
      },
    ];

    const deletedIds = new Set(["score-1"]);

    const result = mergeScoresWithCache(serverScores, [], deletedIds);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("score-2");
  });

  it("should overlay cached scores onto server scores", () => {
    const serverScores: ScoreDomain[] = [
      {
        id: "score-1",
        name: "quality",
        source: "ANNOTATION",
        dataType: "NUMERIC",
        value: 5,
        stringValue: null,
        configId: "config-1",
        comment: "Old value",
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
        metadata: {},
        executionTraceId: null,
      },
    ];

    const cachedScores: CachedScore[] = [
      {
        id: "score-1",
        name: "quality",
        dataType: "NUMERIC",
        source: "ANNOTATION",
        configId: "config-1",
        value: 8,
        stringValue: null,
        comment: "Updated value",
        traceId: "trace-1",
        projectId: "project-1",
        environment: "production",
        timestamp: new Date(),
        sessionId: null,
        observationId: null,
      },
    ];

    const result = mergeScoresWithCache(serverScores, cachedScores, new Set());

    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe(8);
    expect(result[0]?.comment).toBe("Updated value");
  });

  it("should add cache-only scores", () => {
    const serverScores: ScoreDomain[] = [
      {
        id: "score-1",
        name: "quality",
        source: "ANNOTATION",
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
        authorUserId: "user-1",
        queueId: null,
        datasetRunId: null,
        metadata: {},
        executionTraceId: null,
      },
    ];

    const cachedScores: CachedScore[] = [
      {
        id: "score-2",
        name: "sentiment",
        dataType: "CATEGORICAL",
        source: "ANNOTATION",
        configId: "config-2",
        value: 0,
        stringValue: "positive",
        comment: null,
        traceId: "trace-1",
        projectId: "project-1",
        environment: "production",
        timestamp: new Date(),
        sessionId: null,
        observationId: null,
      },
    ];

    const result = mergeScoresWithCache(serverScores, cachedScores, new Set());

    expect(result).toHaveLength(2);
    const ids = result.map((s) => s.id);
    expect(ids).toContain("score-1");
    expect(ids).toContain("score-2");
  });

  it("should handle both delete and cache overlay", () => {
    const serverScores: ScoreDomain[] = [
      {
        id: "score-1",
        name: "quality",
        source: "ANNOTATION",
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
        authorUserId: "user-1",
        queueId: null,
        datasetRunId: null,
        metadata: {},
        executionTraceId: null,
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
        metadata: {},
        executionTraceId: null,
      },
    ];

    const cachedScores: CachedScore[] = [
      {
        id: "score-3",
        name: "accuracy",
        dataType: "NUMERIC",
        source: "ANNOTATION",
        configId: "config-3",
        value: 0.95,
        stringValue: null,
        comment: "New score",
        traceId: "trace-1",
        projectId: "project-1",
        environment: "production",
        timestamp: new Date(),
        sessionId: null,
        observationId: null,
      },
    ];

    const deletedIds = new Set(["score-1"]);

    const result = mergeScoresWithCache(serverScores, cachedScores, deletedIds);

    expect(result).toHaveLength(2);
    const ids = result.map((s) => s.id);
    expect(ids).not.toContain("score-1"); // Deleted
    expect(ids).toContain("score-2"); // Server
    expect(ids).toContain("score-3"); // Cache only
  });
});

describe("mergeAggregatesWithCache", () => {
  it("should return server aggregates when cache is empty", () => {
    const serverAggregates: ScoreAggregate = {
      "quality-ANNOTATION-NUMERIC": {
        id: "score-1",
        type: "NUMERIC",
        values: [8],
        average: 8,
        comment: null,
      },
    };

    const result = mergeAggregatesWithCache(serverAggregates, [], new Set());

    expect(Object.keys(result)).toHaveLength(1);
    expect(result["quality-ANNOTATION-NUMERIC"]?.values).toEqual([8]);
  });

  it("should remove deleted aggregates", () => {
    const serverAggregates: ScoreAggregate = {
      "quality-ANNOTATION-NUMERIC": {
        id: "score-1",
        type: "NUMERIC",
        values: [8],
        average: 8,
        comment: null,
      },
      "sentiment-ANNOTATION-CATEGORICAL": {
        id: "score-2",
        type: "CATEGORICAL",
        values: ["positive"],
        valueCounts: [{ value: "positive", count: 1 }],
        comment: null,
      },
    };

    const deletedIds = new Set(["score-1"]);

    const result = mergeAggregatesWithCache(serverAggregates, [], deletedIds);

    expect(Object.keys(result)).toHaveLength(1);
    expect(result["quality-ANNOTATION-NUMERIC"]).toBeUndefined();
    expect(result["sentiment-ANNOTATION-CATEGORICAL"]).toBeDefined();
  });

  it("should overlay cached numeric score", () => {
    const serverAggregates: ScoreAggregate = {
      "quality-ANNOTATION-NUMERIC": {
        id: "score-1",
        type: "NUMERIC",
        values: [5],
        average: 5,
        comment: "Old",
      },
    };

    const cachedScores: CachedScore[] = [
      {
        id: "score-1",
        name: "quality",
        dataType: "NUMERIC",
        source: "ANNOTATION",
        configId: "config-1",
        value: 9,
        stringValue: null,
        comment: "Updated",
        traceId: "trace-1",
        projectId: "project-1",
        environment: "production",
        timestamp: new Date(),
        sessionId: null,
        observationId: null,
      },
    ];

    const result = mergeAggregatesWithCache(
      serverAggregates,
      cachedScores,
      new Set(),
    );

    const aggregate = result["quality-ANNOTATION-NUMERIC"];
    expect(aggregate).toBeDefined();
    expect(aggregate?.type).toBe("NUMERIC");
    if (aggregate?.type === "NUMERIC") {
      expect(aggregate.average).toBe(9);
      expect(aggregate.comment).toBe("Updated");
      expect(aggregate.id).toBe("score-1");
    }
  });

  it("should overlay cached categorical score", () => {
    const serverAggregates: ScoreAggregate = {
      "sentiment-ANNOTATION-CATEGORICAL": {
        id: "score-2",
        type: "CATEGORICAL",
        values: ["negative"],
        valueCounts: [{ value: "negative", count: 1 }],
        comment: null,
      },
    };

    const cachedScores: CachedScore[] = [
      {
        id: "score-2",
        name: "sentiment",
        dataType: "CATEGORICAL",
        source: "ANNOTATION",
        configId: "config-2",
        value: 0,
        stringValue: "positive",
        comment: "Changed",
        traceId: "trace-1",
        projectId: "project-1",
        environment: "production",
        timestamp: new Date(),
        sessionId: null,
        observationId: null,
      },
    ];

    const result = mergeAggregatesWithCache(
      serverAggregates,
      cachedScores,
      new Set(),
    );

    const aggregate = result["sentiment-ANNOTATION-CATEGORICAL"];
    expect(aggregate).toBeDefined();
    expect(aggregate?.type).toBe("CATEGORICAL");
    if (aggregate?.type === "CATEGORICAL") {
      expect(aggregate.values).toEqual(["positive"]);
      expect(aggregate.comment).toBe("Changed");
      expect(aggregate.id).toBe("score-2");
    }
  });

  it("should add cache-only aggregates", () => {
    const serverAggregates: ScoreAggregate = {
      "quality-ANNOTATION-NUMERIC": {
        id: "score-1",
        type: "NUMERIC",
        values: [8],
        average: 8,
        comment: null,
      },
    };

    const cachedScores: CachedScore[] = [
      {
        id: "score-3",
        name: "accuracy",
        dataType: "NUMERIC",
        source: "ANNOTATION",
        configId: "config-3",
        value: 0.95,
        stringValue: null,
        comment: "New",
        traceId: "trace-1",
        projectId: "project-1",
        environment: "production",
        timestamp: new Date(),
        sessionId: null,
        observationId: null,
      },
      {
        id: "score-3",
        name: "accuracy",
        dataType: "NUMERIC",
        source: "ANNOTATION",
        configId: "config-3",
        value: 0.95,
        stringValue: null,
        comment: "New",
        traceId: "trace-1",
        projectId: "project-1",
        environment: "production",
        timestamp: new Date(),
        sessionId: null,
        observationId: null,
      },
    ];

    const result = mergeAggregatesWithCache(
      serverAggregates,
      cachedScores,
      new Set(),
    );

    expect(Object.keys(result)).toHaveLength(2);
    expect(result["accuracy-ANNOTATION-NUMERIC"]).toBeDefined();
  });
});

describe("mergeAnnotationScoresWithCache", () => {
  it("should return server annotation scores when cache is empty", () => {
    const serverAnnotationScores: AnnotationScore[] = [
      {
        id: "score-1",
        name: "quality",
        dataType: "NUMERIC",
        source: "ANNOTATION",
        configId: "config-1",
        value: 8,
        stringValue: null,
        comment: null,
        traceId: "trace-1",
        observationId: null,
        sessionId: null,
      },
    ];

    const result = mergeAnnotationScoresWithCache(
      serverAnnotationScores,
      [],
      new Set(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("score-1");
  });

  it("should filter out deleted annotation scores", () => {
    const serverAnnotationScores: AnnotationScore[] = [
      {
        id: "score-1",
        name: "quality",
        dataType: "NUMERIC",
        source: "ANNOTATION",
        configId: "config-1",
        value: 8,
        stringValue: null,
        comment: null,
        traceId: "trace-1",
        observationId: null,
        sessionId: null,
      },
      {
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
      },
    ];

    const deletedIds = new Set(["score-1"]);

    const result = mergeAnnotationScoresWithCache(
      serverAnnotationScores,
      [],
      deletedIds,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("score-2");
  });

  it("should overlay cached annotation scores", () => {
    const serverAnnotationScores: AnnotationScore[] = [
      {
        id: "score-1",
        name: "quality",
        dataType: "NUMERIC",
        source: "ANNOTATION",
        configId: "config-1",
        value: 5,
        stringValue: null,
        comment: "Old",
        traceId: "trace-1",
        observationId: null,
        sessionId: null,
      },
    ];

    const cachedScores: CachedScore[] = [
      {
        id: "score-1",
        name: "quality",
        dataType: "NUMERIC",
        source: "ANNOTATION",
        configId: "config-1",
        value: 9,
        stringValue: null,
        comment: "Updated",
        traceId: "trace-1",
        projectId: "project-1",
        environment: "production",
        timestamp: new Date(),
        sessionId: null,
        observationId: null,
      },
    ];

    const result = mergeAnnotationScoresWithCache(
      serverAnnotationScores,
      cachedScores,
      new Set(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe(9);
    expect(result[0]?.comment).toBe("Updated");
  });

  it("should add cache-only annotation scores", () => {
    const serverAnnotationScores: AnnotationScore[] = [
      {
        id: "score-1",
        name: "quality",
        dataType: "NUMERIC",
        source: "ANNOTATION",
        configId: "config-1",
        value: 8,
        stringValue: null,
        comment: null,
        traceId: "trace-1",
        observationId: null,
        sessionId: null,
      },
    ];

    const cachedScores: CachedScore[] = [
      {
        id: "score-2",
        name: "sentiment",
        dataType: "CATEGORICAL",
        source: "ANNOTATION",
        configId: "config-2",
        value: 0,
        stringValue: "positive",
        comment: "New",
        traceId: "trace-1",
        projectId: "project-1",
        environment: "production",
        timestamp: new Date(),
        sessionId: null,
        observationId: null,
      },
    ];

    const result = mergeAnnotationScoresWithCache(
      serverAnnotationScores,
      cachedScores,
      new Set(),
    );

    expect(result).toHaveLength(2);
    const ids = result.map((s) => s.id);
    expect(ids).toContain("score-1");
    expect(ids).toContain("score-2");
  });

  it("should convert CachedScore fields correctly", () => {
    const serverAnnotationScores: AnnotationScore[] = [];

    const cachedScores: CachedScore[] = [
      {
        id: "score-1",
        name: "quality",
        dataType: "NUMERIC",
        source: "ANNOTATION",
        configId: "config-1",
        value: 8,
        stringValue: null,
        comment: "Test",
        traceId: "trace-1",
        observationId: "obs-1",
        sessionId: null,
        projectId: "project-1",
        environment: "production",
        timestamp: new Date(),
      },
    ];

    const result = mergeAnnotationScoresWithCache(
      serverAnnotationScores,
      cachedScores,
      new Set(),
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
      comment: "Test",
      traceId: "trace-1",
      observationId: "obs-1",
      sessionId: null,
      timestamp: expect.any(Date),
    });
  });
});
