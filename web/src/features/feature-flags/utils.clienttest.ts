import { describe, expect, it } from "vitest";

import {
  featurePreviewDefaultsToEnabled,
  getFeaturePreviewOptOutFlag,
  parseFlags,
  type FeaturePreviewDefaultContext,
} from "./utils";

const baseContext: FeaturePreviewDefaultContext = {
  email: "user@example.com",
  v4BetaEnabled: false,
  isLangfuseCloud: false,
  v4WriteMode: "legacy",
};

describe("parseFlags", () => {
  it("enables feature previews by default for Langfuse team members", () => {
    const flags = parseFlags([], {
      ...baseContext,
      email: "team.member@langfuse.com",
      v4BetaEnabled: true,
    });

    expect(flags.modernSession).toBe(true);
    expect(flags.searchBar).toBe(true);
  });

  it("enables feature previews by default for ClickHouse team members", () => {
    const flags = parseFlags([], {
      ...baseContext,
      email: "team.member@clickhouse.com",
      v4BetaEnabled: true,
    });

    expect(flags.modernSession).toBe(true);
    expect(flags.searchBar).toBe(true);
  });

  it("does not enable feature previews by default for other users", () => {
    const flags = parseFlags([], {
      ...baseContext,
      email: "user@example.com",
      v4BetaEnabled: true,
    });

    expect(flags.modernSession).toBe(false);
    expect(flags.searchBar).toBe(false);
  });

  it("honors a Langfuse team member's explicit opt-out", () => {
    const flags = parseFlags([getFeaturePreviewOptOutFlag("modernSession")], {
      ...baseContext,
      email: "team.member@langfuse.com",
      v4BetaEnabled: true,
    });

    expect(flags.modernSession).toBe(false);
    expect(flags.searchBar).toBe(true);
  });
});

describe("v4UpgradeUi default", () => {
  it("is on by default on Langfuse Cloud regardless of write mode", () => {
    for (const v4WriteMode of ["legacy", "dual", "events_only"] as const) {
      const flags = parseFlags([], {
        ...baseContext,
        isLangfuseCloud: true,
        v4WriteMode,
      });
      expect(flags.v4UpgradeUi).toBe(true);
    }
  });

  it("is on by default for self-hosted events_only and dual deployments", () => {
    for (const v4WriteMode of ["events_only", "dual"] as const) {
      const flags = parseFlags([], {
        ...baseContext,
        isLangfuseCloud: false,
        v4WriteMode,
      });
      expect(flags.v4UpgradeUi).toBe(true);
    }
  });

  it("stays off by default for self-hosted legacy deployments", () => {
    const flags = parseFlags([], {
      ...baseContext,
      isLangfuseCloud: false,
      v4WriteMode: "legacy",
    });
    expect(flags.v4UpgradeUi).toBe(false);
  });

  it("can be explicitly opted into on a self-hosted legacy deployment", () => {
    const flags = parseFlags(["v4UpgradeUi"], {
      ...baseContext,
      isLangfuseCloud: false,
      v4WriteMode: "legacy",
    });
    expect(flags.v4UpgradeUi).toBe(true);
  });

  it("honors an opt-out on a default-on deployment", () => {
    const flags = parseFlags([getFeaturePreviewOptOutFlag("v4UpgradeUi")], {
      ...baseContext,
      isLangfuseCloud: false,
      v4WriteMode: "events_only",
    });
    expect(flags.v4UpgradeUi).toBe(false);
  });
});

describe("featurePreviewDefaultsToEnabled", () => {
  it("returns true for v4UpgradeUi on non-legacy self-hosted deployments", () => {
    expect(
      featurePreviewDefaultsToEnabled("v4UpgradeUi", {
        ...baseContext,
        v4WriteMode: "dual",
      }),
    ).toBe(true);
  });

  it("returns false for v4UpgradeUi on legacy self-hosted deployments", () => {
    expect(
      featurePreviewDefaultsToEnabled("v4UpgradeUi", {
        ...baseContext,
        v4WriteMode: "legacy",
      }),
    ).toBe(false);
  });

  it("does not default modernSession on for non-team members", () => {
    expect(
      featurePreviewDefaultsToEnabled("modernSession", {
        ...baseContext,
        v4BetaEnabled: true,
        v4WriteMode: "events_only",
      }),
    ).toBe(false);
  });
});
