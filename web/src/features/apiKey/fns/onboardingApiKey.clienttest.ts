import { describe, expect, it } from "vitest";

import { onboardingApiKeyCreateInput } from "./onboardingApiKey";

describe("onboardingApiKeyCreateInput", () => {
  it("creates a named Developer key without expiry when key roles are on", () => {
    expect(onboardingApiKeyCreateInput("project-1", true)).toStrictEqual({
      projectId: "project-1",
      name: "onboarding-setup-key",
      role: "MEMBER",
    });
  });

  it("sends no role when key roles are off, so the server keeps its legacy default", () => {
    expect(onboardingApiKeyCreateInput("project-1", false)).toStrictEqual({
      projectId: "project-1",
      name: "onboarding-setup-key",
    });
  });
});
