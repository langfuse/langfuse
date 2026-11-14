// @vitest-environment node

import { expect, it } from "vitest";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { canOpenPersonalFeaturePreviews } from "./canOpenPersonalFeaturePreviews";
import { testSession } from "@/src/__tests__/fixtures/principal";

it("opens personal previews through Internal view or a Topics grant on self-hosted deployments", () => {
  const session = testSession({
    user: {
      id: "user-1",
      email: "member@clickhouse.com",
      v4BetaEnabled: false,
      canCreateOrganizations: true,
      featureFlags: testFeatureFlags(),
    },
    organizations: [],
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: null,
    },
  });
  const input = {
    session,
    isLangfuseCloud: false,
  };

  expect(canOpenPersonalFeaturePreviews(input)).toBe(true);

  session.authCtx.principal.user.featureFlags.internalFeatures = false;
  expect(canOpenPersonalFeaturePreviews(input)).toBe(false);

  session.authCtx.principal.user.email = "member@example.com";
  session.authCtx.principal.user.featureFlags.langfuseTopics = true;
  expect(canOpenPersonalFeaturePreviews(input)).toBe(true);

  session.authCtx.principal.user.featureFlags.langfuseTopics = false;
  expect(canOpenPersonalFeaturePreviews(input)).toBe(false);

  session.authCtx.principal.user.v4BetaEnabled = true;
  expect(canOpenPersonalFeaturePreviews(input)).toBe(true);

  session.authCtx.principal.user.v4BetaEnabled = false;
  input.isLangfuseCloud = true;
  expect(canOpenPersonalFeaturePreviews(input)).toBe(true);
});
