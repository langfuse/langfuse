import { describe, expect, it } from "vitest";

import { getAvailableGatewayProviders } from "@/src/features/ai-gateway/fns/getAvailableGatewayProviders";

describe("getAvailableGatewayProviders", () => {
  it("offers Bedrock only in development, previews, staging and dev", () => {
    const allProviders = ["OPENAI", "ANTHROPIC", "BEDROCK"];

    expect(getAvailableGatewayProviders({ nodeEnv: "development" })).toEqual(
      allProviders,
    );
    expect(
      getAvailableGatewayProviders({
        nodeEnv: "production",
        previewPrUrl: "https://github.com/langfuse/langfuse/pull/1",
      }),
    ).toEqual(allProviders);
    expect(
      getAvailableGatewayProviders({
        nodeEnv: "production",
        cloudRegion: "STAGING",
      }),
    ).toEqual(allProviders);
    expect(
      getAvailableGatewayProviders({
        nodeEnv: "production",
        cloudRegion: "EU",
      }),
    ).toEqual(["OPENAI", "ANTHROPIC"]);
    expect(getAvailableGatewayProviders({ nodeEnv: "production" })).toEqual([
      "OPENAI",
      "ANTHROPIC",
    ]);
  });
});
