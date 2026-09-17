const mockEnv = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_BASE_PATH: "",
  },
}));

vi.mock("@/src/env.mjs", () => mockEnv);

import { getDemoCallbackRedirectPath } from "@/src/features/onboarding/components/ConnectedOnboardingSurvey";

describe("getDemoCallbackRedirectPath", () => {
  beforeEach(() => {
    mockEnv.env.NEXT_PUBLIC_BASE_PATH = "";
    window.history.replaceState({}, "", "/onboarding");
  });

  it("preserves demo paths with query strings", () => {
    expect(getDemoCallbackRedirectPath("/demo?utm_source=docs")).toBe(
      "/demo?utm_source=docs",
    );
  });

  it("preserves demo subpaths with query strings", () => {
    expect(
      getDemoCallbackRedirectPath("/demo/traces/trace-1?observation=obs-1"),
    ).toBe("/demo/traces/trace-1?observation=obs-1");
  });

  it("rejects non-demo callback paths", () => {
    expect(getDemoCallbackRedirectPath("/auth/sign-up")).toBeUndefined();
    expect(getDemoCallbackRedirectPath("/demo-other")).toBeUndefined();
  });
});
