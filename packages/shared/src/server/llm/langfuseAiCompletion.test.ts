import { afterEach, describe, expect, it } from "vitest";

import { env } from "../../env";
import { isOrganizationAITelemetryEnabled } from "./langfuseAiCompletion";

describe("isOrganizationAITelemetryEnabled", () => {
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  afterEach(() => {
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  });

  it.each([
    { cloudRegion: "EU", aiTelemetryEnabled: false, expected: false },
    { cloudRegion: "EU", aiTelemetryEnabled: true, expected: true },
    { cloudRegion: undefined, aiTelemetryEnabled: false, expected: true },
  ])(
    "returns $expected for cloudRegion=$cloudRegion, aiTelemetryEnabled=$aiTelemetryEnabled",
    ({ cloudRegion, aiTelemetryEnabled, expected }) => {
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = cloudRegion;

      expect(isOrganizationAITelemetryEnabled({ aiTelemetryEnabled })).toBe(
        expected,
      );
    },
  );
});
