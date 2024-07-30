import { type APIScore } from "@/src/features/public-api/types/scores";
import { aggregateScores } from "./aggregateScores";

describe("aggregateScores", () => {
  // Test Case 1: Empty array
  it("should return an empty object for an empty array", () => {
    const scores: APIScore[] = [];
    expect(aggregateScores(scores)).toEqual({});
  });

  // Test Case 2: Single score, numeric
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
      "test.SOURCE1.NUMERIC": {
        type: "QUANTITATIVE",
        values: [5],
        average: 5,
        comment: "test comment",
      },
    });
  });

  // // Test Case 3: Multiple scores, same key, numeric
  // it("should correctly aggregate multiple numeric scores with the same key", () => {
  //   const scores = [
  //     {
  //       name: "test",
  //       source: ScoreSource.SOURCE1,
  //       dataType: ScoreDataType.NUMERIC,
  //       value: 5,
  //       comment: "test comment",
  //     },
  //     {
  //       name: "test",
  //       source: ScoreSource.SOURCE1,
  //       dataType: ScoreDataType.NUMERIC,
  //       value: 7,
  //       comment: "another comment",
  //     },
  //   ] as APIScore[];
  //   expect(aggregateScores(scores)).toEqual({
  //     "test.SOURCE1.NUMERIC": {
  //       type: "QUANTITATIVE",
  //       values: [5, 7],
  //       average: 6,
  //       comment: undefined,
  //     },
  //   });
  // });

  // // Test Case 4: Multiple scores, different keys
  // it("should correctly aggregate scores with different keys", () => {
  //   const scores: APIScore[] = [
  //     {
  //       name: "test1",
  //       source: ScoreSource.SOURCE1,
  //       dataType: ScoreDataType.NUMERIC,
  //       value: 5,
  //       comment: "test comment",
  //     },
  //     {
  //       name: "test2",
  //       source: ScoreSource.SOURCE2,
  //       dataType: ScoreDataType.NUMERIC,
  //       value: 7,
  //       comment: "another comment",
  //     },
  //   ] as APIScore[];
  //   expect(aggregateScores(scores)).toEqual({
  //     "test1.SOURCE1.NUMERIC": {
  //       type: "QUANTITATIVE",
  //       values: [5],
  //       average: 5,
  //       comment: "test comment",
  //     },
  //     "test2.SOURCE2.NUMERIC": {
  //       type: "QUANTITATIVE",
  //       values: [7],
  //       average: 7,
  //       comment: "another comment",
  //     },
  //   });
  // });

  // // Test Case 5: Single score, qualitative
  // it("should correctly aggregate a single qualitative score", () => {
  //   const scores = [
  //     {
  //       name: "test",
  //       source: ScoreSource.SOURCE1,
  //       dataType: ScoreDataType.QUALITATIVE,
  //       stringValue: "good",
  //       comment: "test comment",
  //     },
  //   ] as APIScore[];
  //   expect(aggregateScores(scores)).toEqual({
  //     "test.SOURCE1.QUALITATIVE": {
  //       type: "QUALITATIVE",
  //       values: ["good"],
  //       distribution: [{ value: "good", count: 1 }],
  //       comment: "test comment",
  //     },
  //   });
  // });

  // // Test Case 6: Multiple scores, same key, qualitative
  // it("should correctly aggregate multiple qualitative scores with the same key", () => {
  //   const scores = [
  //     {
  //       name: "test",
  //       source: ScoreSource.SOURCE1,
  //       dataType: ScoreDataType.QUALITATIVE,
  //       stringValue: "good",
  //       comment: "test comment",
  //     },
  //     {
  //       name: "test",
  //       source: ScoreSource.SOURCE1,
  //       dataType: ScoreDataType.QUALITATIVE,
  //       stringValue: "bad",
  //       comment: "another comment",
  //     },
  //   ] as APIScore[];
  //   expect(aggregateScores(scores)).toEqual({
  //     "test.SOURCE1.QUALITATIVE": {
  //       type: "QUALITATIVE",
  //       values: ["good", "bad"],
  //       distribution: [
  //         { value: "good", count: 1 },
  //         { value: "bad", count: 1 },
  //       ],
  //       comment: undefined,
  //     },
  //   });
  // });

  // Test Case 7: Multiple scores, same name, mixed types
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
        values: ["good"],
        distribution: [{ value: "good", count: 1 }],
        comment: "another comment",
      },
    });
  });
});
