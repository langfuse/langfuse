import { ForbiddenError } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import {
  isGatewayEnabledForOrganization,
  requireGatewayEnabledForOrganization,
} from "./availability";

const deployedProduction = { nodeEnv: "production", deployed: true };

describe("gateway organization allowlist", () => {
  it("matches organization IDs exactly", () => {
    expect(
      isGatewayEnabledForOrganization(
        "org-1",
        ["org-1", "org-2"],
        deployedProduction,
      ),
    ).toBe(true);
    expect(
      isGatewayEnabledForOrganization("org", ["org-1"], deployedProduction),
    ).toBe(false);
  });

  it("keeps the allowlist active when the gateway is not enabled for all", () => {
    expect(
      isGatewayEnabledForOrganization(
        "org-not-allowed",
        [],
        deployedProduction,
      ),
    ).toBe(false);
    expect(() =>
      requireGatewayEnabledForOrganization(
        "org-not-allowed",
        [],
        deployedProduction,
      ),
    ).toThrow(ForbiddenError);
  });

  it("enables every organization when enabled for all", () => {
    expect(
      isGatewayEnabledForOrganization("org-not-allowed", [], {
        ...deployedProduction,
        enabledForAllOrganizations: true,
      }),
    ).toBe(true);
  });
});

describe("gateway deployment", () => {
  it("turns the gateway off when none is deployed, despite flags and allowlist", () => {
    const notDeployed = {
      nodeEnv: "production",
      deployed: false,
      enabledForAllOrganizations: true,
    };

    expect(
      isGatewayEnabledForOrganization("org-1", ["org-1"], notDeployed),
    ).toBe(false);
    expect(() =>
      requireGatewayEnabledForOrganization("org-1", ["org-1"], notDeployed),
    ).toThrow(ForbiddenError);
  });

  it.each([
    { nodeEnv: "development" },
    {
      nodeEnv: "production",
      previewPrUrl: "https://github.com/langfuse/langfuse/pull/18561",
    },
  ])(
    "treats $nodeEnv with preview $previewPrUrl as deployed",
    (environment) => {
      expect(
        isGatewayEnabledForOrganization("org-not-allowed", [], {
          ...environment,
          enabledForAllOrganizations: true,
        }),
      ).toBe(true);
      expect(
        isGatewayEnabledForOrganization("org-not-allowed", [], environment),
      ).toBe(false);
    },
  );

  it.each(["US", "EU", "STAGING", "DEV", "HIPAA", "JP"])(
    "treats Langfuse Cloud region %s as deployed, ignoring the deployed flag",
    (cloudRegion) => {
      const cloud = { nodeEnv: "production", cloudRegion, deployed: false };

      expect(isGatewayEnabledForOrganization("org-1", ["org-1"], cloud)).toBe(
        true,
      );
      expect(isGatewayEnabledForOrganization("org-2", ["org-1"], cloud)).toBe(
        false,
      );
      expect(
        isGatewayEnabledForOrganization("org-2", [], {
          ...cloud,
          enabledForAllOrganizations: true,
        }),
      ).toBe(true);
    },
  );
});
