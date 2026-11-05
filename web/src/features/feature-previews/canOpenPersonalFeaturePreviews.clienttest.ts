// @vitest-environment node

import { expect, it } from "vitest";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { canOpenPersonalFeaturePreviews } from "./canOpenPersonalFeaturePreviews";

it("opens personal previews through Internal view or a Topics grant on self-hosted deployments", () => {
  const session = {
    expires: "2099-01-01",
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: null,
    },
    user: {
      id: "user-1",
      email: "member@clickhouse.com",
      admin: false,
      v4BetaEnabled: false,
      canCreateOrganizations: true,
      organizations: [],
      featureFlags: testFeatureFlags(),
    },
  };
  const input = {
    session,
    isLangfuseCloud: false,
  };

  expect(canOpenPersonalFeaturePreviews(input)).toBe(true);

  session.user.featureFlags.internalFeatures = false;
  expect(canOpenPersonalFeaturePreviews(input)).toBe(false);

  session.user.email = "member@example.com";
  session.user.featureFlags.langfuseTopics = true;
  expect(canOpenPersonalFeaturePreviews(input)).toBe(true);

  session.user.featureFlags.langfuseTopics = false;
  session.user.admin = true;
  expect(canOpenPersonalFeaturePreviews(input)).toBe(false);

  session.user.v4BetaEnabled = true;
  expect(canOpenPersonalFeaturePreviews(input)).toBe(true);

  session.user.v4BetaEnabled = false;
  input.isLangfuseCloud = true;
  expect(canOpenPersonalFeaturePreviews(input)).toBe(true);
});
