// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  getContextualFeatureFlags,
  getFeaturePreviewOptOutFlag,
  parseFlags,
  parseFlagsWithOrganizationDefaults,
} from "./utils";

describe("parseFlags", () => {
  it("enables feature previews by default for Langfuse team members", () => {
    const flags = parseFlags([], {
      email: "team.member@langfuse.com",
      v4BetaEnabled: true,
    });

    expect(flags.modernSession).toBe(true);
  });

  it("enables feature previews by default for ClickHouse team members", () => {
    const flags = parseFlags([], {
      email: "team.member@clickhouse.com",
      v4BetaEnabled: true,
    });

    expect(flags.modernSession).toBe(true);
  });

  it("does not enable feature previews by default for other users", () => {
    const flags = parseFlags([], {
      email: "user@example.com",
      v4BetaEnabled: true,
    });

    expect(flags.modernSession).toBe(false);
  });

  it("enables the gateway flag only for allowlisted organizations", () => {
    expect(
      parseFlags([], {
        email: "user@example.com",
        v4BetaEnabled: true,
        aiGatewayEnabled: true,
      }).aiGateway,
    ).toBe(true);
    expect(
      parseFlags(["aiGateway"], {
        email: "user@example.com",
        v4BetaEnabled: true,
      }).aiGateway,
    ).toBe(false);
    expect(
      parseFlags(["aiGateway"], {
        email: "team.member@langfuse.com",
        v4BetaEnabled: true,
      }).aiGateway,
    ).toBe(false);
  });

  it("honors a Langfuse team member's explicit opt-out", () => {
    const flags = parseFlags(
      [getFeaturePreviewOptOutFlag("modernSession"), "templateFlag"],
      {
        email: "team.member@langfuse.com",
        v4BetaEnabled: true,
      },
    );

    expect(flags.modernSession).toBe(false);
    expect(flags.sessionTimeline).toBe(false);
    // Scoped to its own flag: the opt-out is a STRING match, so a matcher that
    // is too loose would take neighbouring flags down with it. A non-preview
    // flag stands in for that here, which keeps the guard alive no matter how
    // many previews the registry happens to hold.
    expect(flags.templateFlag).toBe(true);
  });

  it("enables internal flags only for Langfuse team members who opted in", () => {
    expect(
      parseFlags(["inAppAgentTraceLink"], {
        email: "team.member@langfuse.com",
        v4BetaEnabled: true,
      }).inAppAgentTraceLink,
    ).toBe(true);
    expect(
      parseFlags(["inAppAgentTraceLink"], {
        email: "user@example.com",
        v4BetaEnabled: true,
      }).inAppAgentTraceLink,
    ).toBe(false);
    expect(
      parseFlags([], {
        email: "team.member@langfuse.com",
        v4BetaEnabled: true,
      }).inAppAgentTraceLink,
    ).toBe(false);
    expect(
      parseFlagsWithOrganizationDefaults([], ["inAppAgentTraceLink"], {
        email: "team.member@langfuse.com",
        v4BetaEnabled: true,
      }).inAppAgentTraceLink,
    ).toBe(false);
  });

  it("honors an explicit opt-out for every user", () => {
    const flags = parseFlags(
      ["modernSession", getFeaturePreviewOptOutFlag("modernSession")],
      {
        email: "user@example.com",
        v4BetaEnabled: true,
      },
    );

    expect(flags.modernSession).toBe(false);
  });

  it("does not enable Session Timeline without Compact Session", () => {
    const flags = parseFlags(["sessionTimeline"], {
      email: "user@example.com",
      v4BetaEnabled: true,
    });

    expect(flags.sessionTimeline).toBe(false);
  });

  it("applies organization defaults without overriding a global opt-out", () => {
    const enabled = parseFlagsWithOrganizationDefaults([], ["modernSession"], {
      email: "user@example.com",
      v4BetaEnabled: true,
    });
    const optedOut = parseFlagsWithOrganizationDefaults(
      [getFeaturePreviewOptOutFlag("modernSession")],
      ["modernSession"],
      { email: "user@example.com", v4BetaEnabled: true },
    );

    expect(enabled.modernSession).toBe(true);
    expect(optedOut.modernSession).toBe(false);
  });

  it("does not apply a Session Timeline organization default without Compact Session", () => {
    const flags = parseFlagsWithOrganizationDefaults([], ["sessionTimeline"], {
      email: "user@example.com",
      v4BetaEnabled: true,
    });

    expect(flags.sessionTimeline).toBe(false);
  });

  it("selects flags from only the active project organization", () => {
    const personalFlags = parseFlags([], {
      email: "user@example.com",
      v4BetaEnabled: true,
    });
    const enabledInFirstOrg = { ...personalFlags, modernSession: true };
    const user = {
      featureFlags: personalFlags,
      organizations: [
        {
          id: "org-a",
          featureFlags: enabledInFirstOrg,
          projects: [{ id: "project-a" }],
        },
        {
          id: "org-b",
          featureFlags: personalFlags,
          projects: [{ id: "project-b" }],
        },
      ],
    };

    expect(
      getContextualFeatureFlags(user, { projectId: "project-a" })
        ?.modernSession,
    ).toBe(true);
    expect(
      getContextualFeatureFlags(user, { projectId: "project-b" })
        ?.modernSession,
    ).toBe(false);
    expect(
      getContextualFeatureFlags(user, { organizationId: "org-a" })
        ?.modernSession,
    ).toBe(true);
  });
});
