import { describe, expect, it } from "vitest";

import { tracingPageView } from "./tracingPageView";

describe("tracingPageView", () => {
  it("renders neither the table nor the onboarding while the first-trace check has no answer", () => {
    expect(
      tracingPageView({ isPending: true, hasTracingConfigured: undefined }),
    ).toBe("checking");
  });

  it("renders the onboarding, not the table, when the project has no traces", () => {
    expect(
      tracingPageView({ isPending: false, hasTracingConfigured: false }),
    ).toBe("onboarding");
  });

  it("renders the onboarding when the first-trace check failed", () => {
    expect(
      tracingPageView({ isPending: false, hasTracingConfigured: undefined }),
    ).toBe("onboarding");
  });

  it("renders the table when the project has traces", () => {
    expect(
      tracingPageView({ isPending: false, hasTracingConfigured: true }),
    ).toBe("table");
  });
});
