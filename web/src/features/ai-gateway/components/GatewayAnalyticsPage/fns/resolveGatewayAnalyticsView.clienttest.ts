import { describe, expect, it } from "vitest";

import { resolveGatewayAnalyticsView } from "./resolveGatewayAnalyticsView";

const withoutKeys = {
  isIngestionConfigured: true,
  isRecording: true,
  isSetupStatusPending: false,
  isLabelsPending: false,
  hasGatewayKeys: false,
};

describe("resolveGatewayAnalyticsView", () => {
  it("shows the first-request placeholder only when no key and no usage exist", () => {
    expect(
      resolveGatewayAnalyticsView({ ...withoutKeys, hasUsageHistory: false }),
    ).toBe("noKeys");
    expect(
      resolveGatewayAnalyticsView({ ...withoutKeys, hasUsageHistory: true }),
    ).toBe("dashboard");
    expect(
      resolveGatewayAnalyticsView({
        ...withoutKeys,
        hasUsageHistory: undefined,
      }),
    ).toBe("loading");
  });
});
