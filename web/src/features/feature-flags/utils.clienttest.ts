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
    expect(flags.compactTimeline).toBe(true);
  });

  it("enables feature previews by default for ClickHouse team members", () => {
    const flags = parseFlags([], {
      email: "team.member@clickhouse.com",
      v4BetaEnabled: true,
    });

    expect(flags.modernSession).toBe(true);
    expect(flags.compactTimeline).toBe(true);
  });

  it("does not enable feature previews by default for other users", () => {
    const flags = parseFlags([], {
      email: "user@example.com",
      v4BetaEnabled: true,
    });

    expect(flags.modernSession).toBe(false);
    expect(flags.compactTimeline).toBe(false);
  });

  it("honors a Langfuse team member's explicit opt-out", () => {
    const flags = parseFlags([getFeaturePreviewOptOutFlag("modernSession")], {
      email: "team.member@langfuse.com",
      v4BetaEnabled: true,
    });

    expect(flags.modernSession).toBe(false);
    // Opting out of one preview leaves the others alone.
    expect(flags.compactTimeline).toBe(true);
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

  it("applies organization defaults without overriding a global opt-out", () => {
    const enabled = parseFlagsWithOrganizationDefaults(
      [],
      ["compactTimeline"],
      { email: "user@example.com", v4BetaEnabled: true },
    );
    const optedOut = parseFlagsWithOrganizationDefaults(
      [getFeaturePreviewOptOutFlag("compactTimeline")],
      ["compactTimeline"],
      { email: "user@example.com", v4BetaEnabled: true },
    );

    expect(enabled.compactTimeline).toBe(true);
    expect(optedOut.compactTimeline).toBe(false);
  });

  it("selects flags from only the active project organization", () => {
    const personalFlags = parseFlags([], {
      email: "user@example.com",
      v4BetaEnabled: true,
    });
    const enabledInFirstOrg = { ...personalFlags, compactTimeline: true };
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
        ?.compactTimeline,
    ).toBe(true);
    expect(
      getContextualFeatureFlags(user, { projectId: "project-b" })
        ?.compactTimeline,
    ).toBe(false);
    expect(
      getContextualFeatureFlags(user, { organizationId: "org-a" })
        ?.compactTimeline,
    ).toBe(true);
  });
});
