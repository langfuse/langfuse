import { describe, expect, it } from "vitest";

import { summarizeUnpricedUsage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/summarizeUnpricedUsage";

describe("summarizeUnpricedUsage", () => {
  it("sums requests and tokens of models without recorded cost", () => {
    expect(
      summarizeUnpricedUsage([
        {
          providedModelName: "gpt-5.4-mini",
          count_count: "40",
          sum_totalTokens: "9000",
          sum_totalCost: "1.25",
        },
        {
          providedModelName: "self-hosted-llama",
          count_count: "12",
          sum_totalTokens: "3400",
          sum_totalCost: "0",
        },
        {
          providedModelName: "",
          count_count: 3,
          sum_totalTokens: 600,
          sum_totalCost: null,
        },
      ]),
    ).toEqual({
      requests: 15,
      tokens: 4000,
      models: ["self-hosted-llama", "Unknown model"],
    });
  });

  it("reports nothing when every model is priced", () => {
    expect(
      summarizeUnpricedUsage([
        {
          providedModelName: "gpt-5.4-mini",
          count_count: 4,
          sum_totalTokens: 900,
          sum_totalCost: 0.004,
        },
      ]),
    ).toEqual({ requests: 0, tokens: 0, models: [] });
  });
});
