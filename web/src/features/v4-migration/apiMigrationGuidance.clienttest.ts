import { describe, expect, it } from "vitest";
import {
  getApiMigrationGuidance,
  getCodingAgentName,
} from "./apiMigrationGuidance";

describe("getApiMigrationGuidance", () => {
  it("provides exact Python trace migration methods", () => {
    expect(
      getApiMigrationGuidance("GET /api/public/traces/{id}", "python", "3.9.0"),
    ).toEqual({
      currentMethod: "client.api.trace.get(...)",
      replacementMethod: "client.api.observations.get_many(...)",
      replacement: "GET /api/public/v2/observations",
      minimumVersion: "4.0.0",
      requiresUpgrade: true,
    });
  });

  it("uses the language-specific Scores v3 client and version", () => {
    expect(
      getApiMigrationGuidance(
        "GET /api/public/v2/scores",
        "javascript",
        "5.4.0",
      ),
    ).toMatchObject({
      currentMethod: "client.api.scores.getMany(...)",
      replacementMethod: "client.api.scoresV3.getManyV3(...)",
      minimumVersion: "5.5.0",
      requiresUpgrade: true,
    });
  });

  it("returns REST guidance without inventing an SDK method", () => {
    expect(
      getApiMigrationGuidance("GET /api/public/traces", undefined, undefined),
    ).toEqual({
      replacement: "GET /api/public/v2/observations",
    });
  });
});

describe("getCodingAgentName", () => {
  it.each([
    ["codex-cli/1.2.3", "Codex"],
    ["claude-code/1.0", "Claude Code"],
    ["cursor-agent/0.9", "Cursor"],
  ])("recognizes %s", (userAgent, expected) => {
    expect(getCodingAgentName(userAgent)).toBe(expected);
  });
});
