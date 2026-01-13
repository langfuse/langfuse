import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { type ScoreDomain } from "@langfuse/shared";

describe("aggregateScores", () => {
  it("should return an empty object for an empty array", () => {
    const scores: ScoreDomain[] = [];
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
      },
    ] as ScoreDomain[];
    expect(aggregateScores(scores)).toEqual({
      "test-API-NUMERIC": {
        type: "NUMERIC",
        values: [5],
        average: 5,
        comment: "test comment",
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
    ] as ScoreDomain[];
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
    ] as ScoreDomain[];
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
    const scores: ScoreDomain[] = [
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
    ] as ScoreDomain[];
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
    ] as ScoreDomain[];
    expect(aggregateScores(scores)).toEqual({
      "test-ANNOTATION-CATEGORICAL": {
        type: "CATEGORICAL",
        values: ["good"],
        valueCounts: [{ value: "good", count: 1 }],
        comment: "test comment",
      },
    });
  });

  it("should correctly aggregate multiple Categorical scores with the same key", () => {
    const scores = [
      {
        name: "test",
        source: "API",
        dataType: "BOOLEAN",
        stringValue: "True",
        comment: "test comment",
      },
      {
        name: "test",
        source: "API",
        dataType: "BOOLEAN",
        stringValue: "False",
        comment: "another comment",
      },
    ] as ScoreDomain[];
    expect(aggregateScores(scores)).toEqual({
      "test-API-BOOLEAN": {
        type: "CATEGORICAL",
        values: ["True", "False"],
        valueCounts: [
          { value: "True", count: 1 },
          { value: "False", count: 1 },
        ],
        comment: undefined,
      },
    });
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
    ] as ScoreDomain[];
    expect(aggregateScores(scores)).toEqual({
      "test-API-NUMERIC": {
        type: "NUMERIC",
        values: [5],
        average: 5,
        comment: "test comment",
      },
      "test-ANNOTATION-CATEGORICAL": {
        type: "CATEGORICAL",
        values: ["good", "bad", "good"],
        valueCounts: [
          { value: "good", count: 2 },
          { value: "bad", count: 1 },
        ],
        comment: undefined,
      },
    });
  });
});
