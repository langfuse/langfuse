import { describe, expect, it } from "vitest";

import { getAvailableGatewayProviders } from "@/src/features/ai-gateway/fns/getAvailableGatewayProviders";

describe("getAvailableGatewayProviders", () => {
  it("offers Google AI Studio only in pre-release environments", () => {
    expect(
      getAvailableGatewayProviders({
        nodeEnv: "production",
        cloudRegion: "EU",
      }),
    ).not.toContain("GOOGLE_AI_STUDIO");
    expect(
      getAvailableGatewayProviders({
        nodeEnv: "production",
        cloudRegion: "STAGING",
      }),
    ).toContain("GOOGLE_AI_STUDIO");
  });
});
