import { aggregateScores } from "@/src/features/manual-scoring/lib/aggregateScores";
import { type APIScore } from "@/src/features/public-api/types/scores";

describe("aggregateScores", () => {
  it("should return an empty object for an empty array", () => {
    const scores: APIScore[] = [];
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
    ] as APIScore[];
    expect(aggregateScores(scores)).toEqual({
      "test.API.NUMERIC": {
        type: "QUANTITATIVE",
        values: [5],
        average: 5,
        comment: "test comment",
      },
    });
  });

  it("should correctly aggregate a single numeric score with prefix", () => {
    const scores = [
      {
        name: "test",
        source: "API",
        dataType: "NUMERIC",
        value: 5,
        comment: "test comment",
      },
    ] as APIScore[];
    expect(aggregateScores(scores, "pre")).toEqual({
      "pre.test.API.NUMERIC": {
        type: "QUANTITATIVE",
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
    ] as APIScore[];
    expect(aggregateScores(scores)).toEqual({
      "test.API.NUMERIC": {
        type: "QUANTITATIVE",
        values: [5, 7],
        average: 6,
        comment: undefined,
      },
    });
  });

  it("should correctly aggregate scores with different keys", () => {
    const scores: APIScore[] = [
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
    ] as APIScore[];
    expect(aggregateScores(scores)).toEqual({
      "test1.API.NUMERIC": {
        type: "QUANTITATIVE",
        values: [5],
        average: 5,
        comment: "test comment",
      },
      "test1.ANNOTATION.NUMERIC": {
        type: "QUANTITATIVE",
        values: [7],
        average: 7,
        comment: "another comment",
      },
    });
  });

  it("should correctly aggregate a single qualitative score", () => {
    const scores = [
      {
        name: "test",
        source: "ANNOTATION",
        dataType: "CATEGORICAL",
        stringValue: "good",
        comment: "test comment",
      },
    ] as APIScore[];
    expect(aggregateScores(scores)).toEqual({
      "test.ANNOTATION.CATEGORICAL": {
        type: "QUALITATIVE",
        values: ["good"],
        distribution: [{ value: "good", count: 1 }],
        comment: "test comment",
      },
    });
  });

  it("should correctly aggregate multiple qualitative scores with the same key", () => {
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
    ] as APIScore[];
    expect(aggregateScores(scores)).toEqual({
      "test.API.BOOLEAN": {
        type: "QUALITATIVE",
        values: ["True", "False"],
        distribution: [
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
        comment: "another comment",
      },
      {
        name: "test",
        source: "ANNOTATION",
        dataType: "CATEGORICAL",
        stringValue: "bad",
        comment: "last comment",
      },
      {
        name: "test",
        source: "ANNOTATION",
        dataType: "CATEGORICAL",
        stringValue: "good",
        comment: "last comment",
      },
    ] as APIScore[];
    expect(aggregateScores(scores)).toEqual({
      "test.API.NUMERIC": {
        type: "QUANTITATIVE",
        values: [5],
        average: 5,
        comment: "test comment",
      },
      "test.ANNOTATION.CATEGORICAL": {
        type: "QUALITATIVE",
        values: ["good", "bad", "good"],
        distribution: [
          { value: "good", count: 2 },
          { value: "bad", count: 1 },
        ],
        comment: undefined,
      },
    });
  });
});
