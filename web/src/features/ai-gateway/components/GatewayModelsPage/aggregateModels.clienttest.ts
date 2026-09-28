import { describe, expect, it } from "vitest";
import { aggregateModels } from "./aggregateModels";

type Connection = Parameters<typeof aggregateModels>[1][number];
type Result = Parameters<typeof aggregateModels>[0][number];

describe("aggregateModels", () => {
  it("keeps existing model positions when another connection page loads", () => {
    const first = {
      id: "first",
      name: "First",
      provider: "OPENAI",
    } as Connection;
    const second = {
      id: "second",
      name: "Second",
      provider: "ANTHROPIC",
    } as Connection;
    const results = [
      { connectionId: "second", success: true, models: ["a-model"] },
      { connectionId: "first", success: true, models: ["z-model", "b-model"] },
    ] as Result[];

    expect(aggregateModels(results, [first]).map((model) => model.id)).toEqual([
      "b-model",
      "z-model",
    ]);
    expect(
      aggregateModels(results, [first, second]).map((model) => model.id),
    ).toEqual(["b-model", "z-model", "a-model"]);
  });
});
