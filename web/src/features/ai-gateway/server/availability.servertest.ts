import { ForbiddenError } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import {
  isGatewayEnabledForOrganization,
  requireGatewayEnabledForOrganization,
} from "./availability";

describe("gateway organization allowlist", () => {
  it("matches organization IDs exactly", () => {
    const environment = { nodeEnv: "production" };

    expect(
      isGatewayEnabledForOrganization("org-1", ["org-1", "org-2"], environment),
    ).toBe(true);
    expect(isGatewayEnabledForOrganization("org", ["org-1"], environment)).toBe(
      false,
    );
  });

  it("keeps the allowlist active outside local development", () => {
    expect(
      isGatewayEnabledForOrganization("org-not-allowed", [], {
        nodeEnv: "production",
      }),
    ).toBe(false);
    expect(() =>
      requireGatewayEnabledForOrganization("org-not-allowed", [], {
        nodeEnv: "production",
      }),
    ).toThrow(ForbiddenError);
  });

  it("enables every organization when the gateway is enabled globally", () => {
    const environment = {
      nodeEnv: "production",
      enabledForAllOrganizations: true,
    };

    expect(
      isGatewayEnabledForOrganization("org-not-allowed", [], environment),
    ).toBe(true);
    expect(() =>
      requireGatewayEnabledForOrganization("org-not-allowed", [], environment),
    ).not.toThrow();
  });

  it("enables the gateway in preview deployments", () => {
    expect(
      isGatewayEnabledForOrganization("org-not-allowed", [], {
        nodeEnv: "production",
        previewPrUrl: "https://github.com/langfuse/langfuse/pull/18561",
      }),
    ).toBe(true);
  });
});
