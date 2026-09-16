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
});
