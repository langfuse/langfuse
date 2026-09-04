// @vitest-environment node

import {
  aggregateScores,
  type ScoreToAggregate,
} from "@/src/features/scores/lib/aggregateScores";

describe("aggregateScores", () => {
  it("should return an empty object for an empty array", () => {
    const scores: ScoreToAggregate[] = [];
    expect(aggregateScores(scores)).toEqual({});
  });

  it("should correctly aggregate a single numeric score", () => {
    const scores = [
      {
        name: "test",
        source: "API",
        dataType: "NUMERIC",
        value: 5,
        comment: "test comment",
        executionTraceId: "execution-trace-id",
      },
    ] as ScoreToAggregate[];
    expect(aggregateScores(scores)).toEqual({
      "test-API-NUMERIC": {
        type: "NUMERIC",
        values: [5],
        average: 5,
        comment: "test comment",
        executionTraceId: "execution-trace-id",
      },
    });
  });

  it("should correctly aggregate multiple numeric scores with the same key", () => {
    const scores = [
      {
        name: "test",
        source: "API",
        dataType: "NUMERIC",
        value: 5,
        comment: "test comment",
      },
      {
        name: "test",
        source: "API",
        dataType: "NUMERIC",
        value: 7,
        comment: "another comment",
      },
    ] as ScoreToAggregate[];
    expect(aggregateScores(scores)).toEqual({
      "test-API-NUMERIC": {
        type: "NUMERIC",
        values: [5, 7],
        average: 6,
        comment: undefined,
      },
    });
  });

  it("should correctly aggregate multiple numeric scores with the same key and value", () => {
    const scores = [
      {
        name: "test",
        source: "API",
        dataType: "NUMERIC",
        value: 5,
        comment: "test comment",
      },
      {
        name: "test",
        source: "API",
        dataType: "NUMERIC",
        value: 5,
        comment: "another comment",
      },
    ] as ScoreToAggregate[];
    expect(aggregateScores(scores)).toEqual({
      "test-API-NUMERIC": {
        type: "NUMERIC",
        values: [5, 5],
        average: 5,
        comment: undefined,
      },
    });
  });

  it("should correctly aggregate scores with different keys", () => {
    const scores: ScoreToAggregate[] = [
      {
        name: "test1",
        source: "API",
        dataType: "NUMERIC",
        value: 5,
        comment: "test comment",
      },
      {
        name: "test1",
        source: "ANNOTATION",
        dataType: "NUMERIC",
        value: 7,
        comment: "another comment",
      },
    ] as ScoreToAggregate[];
    expect(aggregateScores(scores)).toEqual({
      "test1-API-NUMERIC": {
        type: "NUMERIC",
        values: [5],
        average: 5,
        comment: "test comment",
      },
      "test1-ANNOTATION-NUMERIC": {
        type: "NUMERIC",
        values: [7],
        average: 7,
        comment: "another comment",
      },
    });
  });

  it("should correctly aggregate a single Categorical score", () => {
    const scores = [
      {
        name: "test",
        source: "ANNOTATION",
        dataType: "CATEGORICAL",
        stringValue: "good",
        comment: "test comment",
      },
    ] as ScoreToAggregate[];
    expect(aggregateScores(scores)).toEqual({
      "test-ANNOTATION-CATEGORICAL": {
        type: "CATEGORICAL",
        values: ["good"],
        valueCounts: [{ value: "good", count: 1 }],
        comment: "test comment",
      },
    });
  });

  it("should render Boolean scores as true/false", () => {
    const scores = [
      {
        name: "test",
        source: "API",
        dataType: "BOOLEAN",
        value: 1,
        stringValue: "True",
        comment: "test comment",
      },
      {
        name: "test",
        source: "API",
        dataType: "BOOLEAN",
        value: 0,
        stringValue: "False",
        comment: "another comment",
      },
    ] as ScoreToAggregate[];
    expect(aggregateScores(scores)).toEqual({
      "test-API-BOOLEAN": {
        type: "CATEGORICAL",
        values: ["false", "true"],
        valueCounts: [
          { value: "false", count: 1 },
          { value: "true", count: 1 },
        ],
        comment: undefined,
      },
    });
  });

  it("should order a cell's values the same way regardless of input order", () => {
    const asScores = (stringValues: string[]) =>
      stringValues.map((stringValue) => ({
        name: "verdict",
        source: "API",
        dataType: "CATEGORICAL",
        stringValue,
      })) as ScoreToAggregate[];

    expect(aggregateScores(asScores(["pass", "fail", "pass"]))).toEqual(
      aggregateScores(asScores(["fail", "pass", "pass"])),
    );
  });

  it("should correctly aggregate scores with mixed types and the same name", () => {
    const scores = [
      {
        name: "test",
        source: "API",
        dataType: "NUMERIC",
        value: 5,
        comment: "test comment",
      },
      {
        name: "test",
        source: "ANNOTATION",
        dataType: "CATEGORICAL",
        stringValue: "good",
        value: 0,
        comment: "another comment",
      },
      {
        name: "test",
        source: "ANNOTATION",
        dataType: "CATEGORICAL",
        stringValue: "bad",
        value: 0,
        comment: "last comment",
      },
      {
        name: "test",
        source: "ANNOTATION",
        dataType: "CATEGORICAL",
        stringValue: "good",
        value: 0,
        comment: "last comment",
      },
    ] as ScoreToAggregate[];
    expect(aggregateScores(scores)).toEqual({
      "test-API-NUMERIC": {
        type: "NUMERIC",
        values: [5],
        average: 5,
        comment: "test comment",
      },
      "test-ANNOTATION-CATEGORICAL": {
        type: "CATEGORICAL",
        values: ["bad", "good", "good"],
        valueCounts: [
          { value: "bad", count: 1 },
          { value: "good", count: 2 },
        ],
        comment: undefined,
      },
    });
  });
});
