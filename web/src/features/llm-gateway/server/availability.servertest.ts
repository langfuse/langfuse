import { ForbiddenError } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import {
  isGatewayEnabledForOrganization,
  requireGatewayEnabledForOrganization,
} from "./availability";

describe("gateway organization allowlist", () => {
  it("matches organization IDs exactly", () => {
    expect(isGatewayEnabledForOrganization("org-1", ["org-1", "org-2"])).toBe(
      true,
    );
    expect(isGatewayEnabledForOrganization("org", ["org-1"])).toBe(false);
  });

  it("rejects organizations outside the configured allowlist", () => {
    expect(() =>
      requireGatewayEnabledForOrganization("org-not-allowed", []),
    ).toThrow(ForbiddenError);
  });
});
