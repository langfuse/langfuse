import { LLMAdapter } from "@langfuse/shared";

import { getJudgeModelProviderAdapters } from "./judgeModel";

describe("judge model connections", () => {
  const connections = [
    {
      provider: "OpenAI",
      adapter: LLMAdapter.OpenAI,
      customModels: ["custom-model", "gpt-4.1-mini"],
      withDefaultModels: true,
    },
  ];

  it("indexes adapters by provider for default-model updates", () => {
    expect(getJudgeModelProviderAdapters(connections)).toEqual({
      OpenAI: LLMAdapter.OpenAI,
    });
  });
});
