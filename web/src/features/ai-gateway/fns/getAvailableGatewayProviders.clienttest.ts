import { describe, expect, it } from "vitest";

import { getAvailableGatewayProviders } from "@/src/features/ai-gateway/fns/getAvailableGatewayProviders";

describe("getAvailableGatewayProviders", () => {
  it("offers Vertex AI only in pre-release environments", () => {
    expect(
      getAvailableGatewayProviders({
        nodeEnv: "production",
        cloudRegion: "EU",
      }),
    ).not.toContain("VERTEX");
    expect(
      getAvailableGatewayProviders({
        nodeEnv: "production",
        cloudRegion: "STAGING",
      }),
    ).toContain("VERTEX");
  });
});
