import { getFirstCodeEvaluatorScoreDataType } from "./getFirstCodeEvaluatorScoreDataType";

describe("getFirstCodeEvaluatorScoreDataType", () => {
  it("uses the first supported score data type in TypeScript source", () => {
    expect(
      getFirstCodeEvaluatorScoreDataType(`
        return {
          scores: [
            { name: "Passed", dataType: "BOOLEAN", value: true },
            { name: "Confidence", dataType: "NUMERIC", value: 1 },
          ],
        };
      `),
    ).toBe("BOOLEAN");
  });

  it("reads quoted Python dictionary keys", () => {
    expect(
      getFirstCodeEvaluatorScoreDataType(`
        return {
          "scores": [
            {"name": "Confidence", "dataType": "NUMERIC", "value": 1}
          ]
        }
      `),
    ).toBe("NUMERIC");
  });

  it("does not skip an unsupported first score type", () => {
    expect(
      getFirstCodeEvaluatorScoreDataType(`
        return {
          scores: [
            { name: "Explanation", dataType: "TEXT", value: "ok" },
            { name: "Confidence", dataType: "NUMERIC", value: 1 },
          ],
        };
      `),
    ).toBeUndefined();
  });
});
