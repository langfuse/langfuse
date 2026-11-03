// @vitest-environment node

import { describe, expect, it } from "vitest";
import { type Session } from "next-auth";
import { type Role } from "@langfuse/shared";

import { gatewayOnlyLanding } from "./gatewayOnlyLanding";

const ORG_ID = "org-1";

describe("gatewayOnlyLanding", () => {
  it("lets a gateway-only member use the gateway in an org without visible projects", () => {
    expect(
      gatewayOnlyLanding(
        session({ role: "AI_GATEWAY", aiGateway: true }),
        ORG_ID,
      ),
    ).toEqual({ organizationId: ORG_ID, canUseGateway: true });
  });

  it("blocks a gateway-only member when the gateway is disabled for the org", () => {
    expect(
      gatewayOnlyLanding(
        session({ role: "AI_GATEWAY", aiGateway: false }),
        ORG_ID,
      ),
    ).toEqual({ organizationId: ORG_ID, canUseGateway: false });
  });

  it("is undefined for a role that can read the org settings", () => {
    expect(
      gatewayOnlyLanding(session({ role: "NONE", aiGateway: true }), ORG_ID),
    ).toBeUndefined();
  });

  it("is undefined for a gateway-only member who sees projects", () => {
    expect(
      gatewayOnlyLanding(
        session({
          role: "AI_GATEWAY",
          aiGateway: true,
          projects: [{ id: "project-1" }],
        }),
        ORG_ID,
      ),
    ).toBeUndefined();
  });
});

function session({
  role,
  aiGateway,
  projects = [],
}: {
  role: Role;
  aiGateway: boolean;
  projects?: { id: string }[];
}) {
  return {
    user: {
      admin: false,
      featureFlags: {},
      organizations: [
        { id: ORG_ID, role, projects, featureFlags: { aiGateway } },
      ],
    },
  } as unknown as Session;
}
