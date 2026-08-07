import { describe, expect, it } from "vitest";

import { getFeaturePreviewOptOutFlag, parseFlags } from "./utils";

describe("parseFlags", () => {
  it("enables feature previews by default for Langfuse team members", () => {
    const flags = parseFlags([], {
      email: "team.member@langfuse.com",
      v4BetaEnabled: true,
    });

    expect(flags.modernSession).toBe(true);
    expect(flags.searchBar).toBe(true);
  });

  it("enables feature previews by default for ClickHouse team members", () => {
    const flags = parseFlags([], {
      email: "team.member@clickhouse.com",
      v4BetaEnabled: true,
    });

    expect(flags.modernSession).toBe(true);
    expect(flags.searchBar).toBe(true);
  });

  it("does not enable feature previews by default for other users", () => {
    const flags = parseFlags([], {
      email: "user@example.com",
      v4BetaEnabled: true,
    });

    expect(flags.modernSession).toBe(false);
    expect(flags.searchBar).toBe(false);
  });

  it("honors a Langfuse team member's explicit opt-out", () => {
    const flags = parseFlags([getFeaturePreviewOptOutFlag("modernSession")], {
      email: "team.member@langfuse.com",
      v4BetaEnabled: true,
    });

    expect(flags.modernSession).toBe(false);
    expect(flags.searchBar).toBe(true);
  });
});
