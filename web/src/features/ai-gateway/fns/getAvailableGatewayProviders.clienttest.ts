import { describe, expect, it } from "vitest";

import { getAvailableGatewayProviders } from "@/src/features/ai-gateway/fns/getAvailableGatewayProviders";

describe("getAvailableGatewayProviders", () => {
  it("offers Bedrock in production cloud regions", () => {
    expect(
      getAvailableGatewayProviders({
        nodeEnv: "production",
        cloudRegion: "EU",
      }),
    ).toEqual(["OPENAI", "ANTHROPIC", "BEDROCK"]);
  });
});
