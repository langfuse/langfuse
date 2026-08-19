// @vitest-environment node

import { describe, expect, it } from "vitest";

import { getFeaturePreviewOptOutFlag, parseFlags } from "./utils";

describe("parseFlags", () => {
  it("enables feature previews by default for Langfuse team members", () => {
    const flags = parseFlags([], {
      email: "team.member@langfuse.com",
      v4BetaEnabled: true,
      v4UpgradeUiAvailable: true,
    });

    expect(flags.modernSession).toBe(true);
    expect(flags.searchBar).toBe(true);
    expect(flags.compactTimeline).toBe(true);
  });

  it("enables feature previews by default for ClickHouse team members", () => {
    const flags = parseFlags([], {
      email: "team.member@clickhouse.com",
      v4BetaEnabled: true,
      v4UpgradeUiAvailable: true,
    });

    expect(flags.modernSession).toBe(true);
    expect(flags.searchBar).toBe(true);
    expect(flags.compactTimeline).toBe(true);
  });

  it("does not enable feature previews by default for other users", () => {
    const flags = parseFlags([], {
      email: "user@example.com",
      v4BetaEnabled: true,
      v4UpgradeUiAvailable: true,
    });

    expect(flags.modernSession).toBe(false);
    expect(flags.searchBar).toBe(false);
    expect(flags.compactTimeline).toBe(false);
  });

  it("honors a Langfuse team member's explicit opt-out", () => {
    const flags = parseFlags([getFeaturePreviewOptOutFlag("modernSession")], {
      email: "team.member@langfuse.com",
      v4BetaEnabled: true,
      v4UpgradeUiAvailable: true,
    });

    expect(flags.modernSession).toBe(false);
    expect(flags.searchBar).toBe(true);
    // Opting out of one preview leaves the others alone.
    expect(flags.compactTimeline).toBe(true);
  });
});

describe("parseFlags — v4 migration UI", () => {
  // The v4 migration UI is not a preview users have to discover: it is on for
  // every user on a deployment that can act on the migration, and off for
  // everyone on one that cannot. `v4UpgradeUiAvailable` is derived from the
  // write mode in the auth session callback (see isV4UpgradeUiAvailable).
  const context = (
    v4UpgradeUiAvailable: boolean,
    email: string | undefined = "user@example.com",
  ) => ({ email, v4BetaEnabled: false, v4UpgradeUiAvailable });

  it("is on by default for a regular user when the deployment can act on it", () => {
    expect(parseFlags([], context(true)).v4UpgradeUi).toBe(true);
  });

  it("is off for every user when the deployment cannot act on it", () => {
    expect(parseFlags([], context(false)).v4UpgradeUi).toBe(false);
    expect(
      parseFlags([], context(false, "team.member@langfuse.com")).v4UpgradeUi,
    ).toBe(false);
  });

  it("honors a regular user's opt-out", () => {
    expect(
      parseFlags([getFeaturePreviewOptOutFlag("v4UpgradeUi")], context(true))
        .v4UpgradeUi,
    ).toBe(false);
  });

  it("ignores a stale opt-in entry on a deployment that cannot act on it", () => {
    // A user who opted in while the deployment was eligible must not keep the
    // migration surfaces once the write mode no longer supports them.
    expect(parseFlags(["v4UpgradeUi"], context(false)).v4UpgradeUi).toBe(false);
  });
});

describe("parseFlags — preview availability", () => {
  it("keeps an unavailable preview off despite an opt-in entry", () => {
    // Compact Session View only reads correctly on the events-backed session
    // view, which is exactly what the Feature Preview modal tells users.
    const flags = parseFlags(["modernSession"], {
      email: "user@example.com",
      v4BetaEnabled: false,
      v4UpgradeUiAvailable: false,
    });

    expect(flags.modernSession).toBe(false);
  });

  it("honors an opt-in entry once the preview is available", () => {
    const flags = parseFlags(["modernSession"], {
      email: "user@example.com",
      v4BetaEnabled: true,
      v4UpgradeUiAvailable: false,
    });

    expect(flags.modernSession).toBe(true);
  });

  it("leaves non-preview flags on the plain opt-in path", () => {
    const flags = parseFlags(["templateFlag"], {
      email: "user@example.com",
      v4BetaEnabled: false,
      v4UpgradeUiAvailable: false,
    });

    expect(flags.templateFlag).toBe(true);
    expect(flags.excludeClickhouseRead).toBe(false);
  });
});
