// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  getContextualFeatureFlags,
  getFeaturePreviewOptOutFlag,
  parseFlags,
  parseFlagsWithOrganizationDefaults,
} from "./utils";
import { getOrganizationFeaturePreviewDefaults } from "./fns/getOrganizationFeaturePreviewDefaults";
import { isFeaturePreviewAvailable } from "./available-flags";

describe("parseFlags", () => {
  it("makes Skill Management an opt-in preview that requires v4", () => {
    const context = { email: "user@example.com", v4BetaEnabled: true };
    expect(
      isFeaturePreviewAvailable("skillManagement", { v4BetaEnabled: false }),
    ).toBe(false);
    expect(isFeaturePreviewAvailable("skillManagement", context)).toBe(true);
    expect(parseFlags([], context).skillManagement).toBe(false);
    expect(parseFlags(["skillManagement"], context).skillManagement).toBe(true);
    expect(
      parseFlagsWithOrganizationDefaults([], ["skillManagement"], context)
        .skillManagement,
    ).toBe(true);
    expect(
      parseFlagsWithOrganizationDefaults(
        [getFeaturePreviewOptOutFlag("skillManagement")],
        ["skillManagement"],
        context,
      ).skillManagement,
    ).toBe(false);
  });

  it.each([
    { flag: "sessionViewV2" as const, expectedView: false },
    { flag: "sessionViewV2Timeline" as const, expectedView: true },
  ])(
    "honors an organization opt-out for $flag over personal opt-ins",
    ({ flag, expectedView }) => {
      const flags = parseFlagsWithOrganizationDefaults(
        ["sessionViewV2", "sessionViewV2Timeline"],
        [getFeaturePreviewOptOutFlag(flag)],
        { email: "user@example.com", v4BetaEnabled: true },
      );
      expect(flags.sessionViewV2).toBe(expectedView);
      expect(flags.sessionViewV2Timeline).toBe(false);
    },
  );

  it("shows session organization defaults as on unless explicitly disabled", () => {
    expect(getOrganizationFeaturePreviewDefaults([])).toEqual([
      "sessionViewV2",
      "sessionViewV2Timeline",
    ]);
    expect(
      getOrganizationFeaturePreviewDefaults([
        getFeaturePreviewOptOutFlag("sessionViewV2Timeline"),
      ]),
    ).toEqual(["sessionViewV2"]);
    expect(
      getOrganizationFeaturePreviewDefaults([
        getFeaturePreviewOptOutFlag("sessionViewV2"),
      ]),
    ).toEqual([]);
  });

  it("requires personal Topics opt-in and ignores team and organization defaults", () => {
    const context = {
      email: "team.member@langfuse.com",
      v4BetaEnabled: true,
    };
    expect(
      parseFlagsWithOrganizationDefaults([], ["langfuseTopics"], context)
        .langfuseTopics,
    ).toBe(false);
    expect(parseFlags(["langfuseTopics"], context).langfuseTopics).toBe(true);
  });

  it("enables feature previews by default for Langfuse team members", () => {
    const flags = parseFlags([], {
      email: "team.member@langfuse.com",
      v4BetaEnabled: true,
    });

    expect(flags.sessionViewV2).toBe(true);
  });

  it("enables feature previews by default for ClickHouse team members", () => {
    const flags = parseFlags([], {
      email: "team.member@clickhouse.com",
      v4BetaEnabled: true,
    });

    expect(flags.sessionViewV2).toBe(true);
  });

  it("enables both session previews by default for every user", () => {
    const flags = parseFlags([], {
      email: "user@example.com",
      v4BetaEnabled: true,
    });

    expect(flags.sessionViewV2).toBe(true);
    expect(flags.sessionViewV2Timeline).toBe(true);
  });

  it("ignores legacy session preferences and organization defaults", () => {
    const flags = parseFlagsWithOrganizationDefaults(
      [
        "modernSession",
        "sessionTimeline",
        "feature-preview:modernSession:disabled",
        "feature-preview:sessionTimeline:disabled",
      ],
      ["modernSession", "sessionTimeline"],
      { email: "user@example.com", v4BetaEnabled: true },
    );

    expect(flags.sessionViewV2).toBe(true);
    expect(flags.sessionViewV2Timeline).toBe(true);
  });

  it("does not default session previews on without the events-backed view", () => {
    const flags = parseFlags([], {
      email: "user@example.com",
      v4BetaEnabled: false,
    });

    expect(flags.sessionViewV2).toBe(false);
    expect(flags.sessionViewV2Timeline).toBe(false);
  });

  it("honors a timeline opt-out without disabling the redesigned view", () => {
    const flags = parseFlags(
      [getFeaturePreviewOptOutFlag("sessionViewV2Timeline")],
      { email: "user@example.com", v4BetaEnabled: true },
    );

    expect(flags.sessionViewV2).toBe(true);
    expect(flags.sessionViewV2Timeline).toBe(false);
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
      [getFeaturePreviewOptOutFlag("sessionViewV2"), "templateFlag"],
      {
        email: "team.member@langfuse.com",
        v4BetaEnabled: true,
      },
    );

    expect(flags.sessionViewV2).toBe(false);
    expect(flags.sessionViewV2Timeline).toBe(false);
    // Scoped to its own flag: the opt-out is a STRING match, so a matcher that
    // is too loose would take neighbouring flags down with it. A non-preview
    // flag stands in for that here, which keeps the guard alive no matter how
    // many previews the registry happens to hold.
    expect(flags.templateFlag).toBe(true);
  });

  it("honors an explicit opt-out for every user", () => {
    const flags = parseFlags(
      ["sessionViewV2", getFeaturePreviewOptOutFlag("sessionViewV2")],
      {
        email: "user@example.com",
        v4BetaEnabled: true,
      },
    );

    expect(flags.sessionViewV2).toBe(false);
  });

  it("does not enable Session Timeline when Redesigned Session View is disabled", () => {
    const flags = parseFlags(
      ["sessionViewV2Timeline", getFeaturePreviewOptOutFlag("sessionViewV2")],
      {
        email: "user@example.com",
        v4BetaEnabled: true,
      },
    );

    expect(flags.sessionViewV2Timeline).toBe(false);
  });

  it("applies organization defaults without overriding a global opt-out", () => {
    const enabled = parseFlagsWithOrganizationDefaults([], ["sessionViewV2"], {
      email: "user@example.com",
      v4BetaEnabled: true,
    });
    const optedOut = parseFlagsWithOrganizationDefaults(
      [getFeaturePreviewOptOutFlag("sessionViewV2")],
      ["sessionViewV2"],
      { email: "user@example.com", v4BetaEnabled: true },
    );

    expect(enabled.sessionViewV2).toBe(true);
    expect(optedOut.sessionViewV2).toBe(false);
  });

  it("enables organization-only previews exclusively through organization defaults", () => {
    const personalOnly = parseFlags(["externalMediaStorage"], {
      email: "user@example.com",
      v4BetaEnabled: true,
    });
    const organizationEnabled = parseFlagsWithOrganizationDefaults(
      ["feature-preview:externalMediaStorage:disabled"],
      ["externalMediaStorage"],
      { email: "user@example.com", v4BetaEnabled: true },
    );

    expect(personalOnly.externalMediaStorage).toBe(false);
    expect(organizationEnabled.externalMediaStorage).toBe(true);
  });

  it("does not apply a Session Timeline organization default when Redesigned Session View is disabled", () => {
    const flags = parseFlagsWithOrganizationDefaults(
      [getFeaturePreviewOptOutFlag("sessionViewV2")],
      ["sessionViewV2Timeline"],
      {
        email: "user@example.com",
        v4BetaEnabled: true,
      },
    );

    expect(flags.sessionViewV2Timeline).toBe(false);
  });

  it("selects flags from only the active project organization", () => {
    const personalFlags = parseFlags(
      [getFeaturePreviewOptOutFlag("sessionViewV2")],
      {
        email: "user@example.com",
        v4BetaEnabled: true,
      },
    );
    const enabledInFirstOrg = { ...personalFlags, sessionViewV2: true };
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
        ?.sessionViewV2,
    ).toBe(true);
    expect(
      getContextualFeatureFlags(user, { projectId: "project-b" })
        ?.sessionViewV2,
    ).toBe(false);
    expect(
      getContextualFeatureFlags(user, { organizationId: "org-a" })
        ?.sessionViewV2,
    ).toBe(true);
  });
});
