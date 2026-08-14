import { describe, expect, it } from "vitest";

import { getFeaturePreviewOptOutFlag, parseFlags } from "./utils";

describe("parseFlags", () => {
  it("enables feature previews by default for Langfuse team members", () => {
    const flags = parseFlags([], {
      email: "team.member@langfuse.com",
      v4BetaEnabled: true,
      isLangfuseCloud: true,
    });

    expect(flags.modernSession).toBe(true);
    expect(flags.searchBar).toBe(true);
  });

  it("enables feature previews by default for ClickHouse team members", () => {
    const flags = parseFlags([], {
      email: "team.member@clickhouse.com",
      v4BetaEnabled: true,
      isLangfuseCloud: true,
    });

    expect(flags.modernSession).toBe(true);
    expect(flags.searchBar).toBe(true);
  });

  it("does not enable feature previews by default for other users", () => {
    const flags = parseFlags([], {
      email: "user@example.com",
      v4BetaEnabled: true,
      isLangfuseCloud: true,
    });

    expect(flags.modernSession).toBe(false);
    expect(flags.searchBar).toBe(false);
  });

  it("honors a Langfuse team member's explicit opt-out", () => {
    const flags = parseFlags([getFeaturePreviewOptOutFlag("modernSession")], {
      email: "team.member@langfuse.com",
      v4BetaEnabled: true,
      isLangfuseCloud: true,
    });

    expect(flags.modernSession).toBe(false);
    expect(flags.searchBar).toBe(true);
  });

  it("enables the v4 migration UI by default on self-hosted v4 deployments", () => {
    const flags = parseFlags([], {
      email: "user@example.com",
      v4BetaEnabled: true,
      isLangfuseCloud: false,
    });

    expect(flags.v4UpgradeUi).toBe(true);
    // Other previews stay opt-in for non team members.
    expect(flags.modernSession).toBe(false);
    expect(flags.searchBar).toBe(false);
  });

  it("honors a self-hoster's explicit opt-out of the v4 migration UI", () => {
    const flags = parseFlags([getFeaturePreviewOptOutFlag("v4UpgradeUi")], {
      email: "user@example.com",
      v4BetaEnabled: true,
      isLangfuseCloud: false,
    });

    expect(flags.v4UpgradeUi).toBe(false);
  });

  it("keeps the v4 migration UI off for self-hosters without the v4 read path", () => {
    const flags = parseFlags([], {
      email: "user@example.com",
      v4BetaEnabled: false,
      isLangfuseCloud: false,
    });

    expect(flags.v4UpgradeUi).toBe(false);
  });

  it("does not enable the v4 migration UI by default on cloud", () => {
    const flags = parseFlags([], {
      email: "user@example.com",
      v4BetaEnabled: true,
      isLangfuseCloud: true,
    });

    expect(flags.v4UpgradeUi).toBe(false);
  });
});
