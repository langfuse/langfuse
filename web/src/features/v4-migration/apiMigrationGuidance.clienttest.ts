import { describe, expect, it } from "vitest";
import {
  getApiMigrationGuidance,
  getCodingAgentName,
} from "./apiMigrationGuidance";

describe("getApiMigrationGuidance", () => {
  it("provides bare Python trace migration methods", () => {
    expect(
      getApiMigrationGuidance("GET /api/public/traces/{id}", "python", "3.9.0"),
    ).toEqual({
      currentMethod: "client.api.trace.get",
      replacementMethod: "client.api.observations.get_many",
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
      currentMethod: "client.api.scores.getMany",
      replacementMethod: "client.api.scoresV3.getManyV3",
      minimumVersion: "5.5.0",
      requiresUpgrade: true,
    });
  });

  it("uses bare score methods for the legacy score endpoint", () => {
    expect(
      getApiMigrationGuidance("GET /api/public/scores/{id}", "python", "4.8.1"),
    ).toMatchObject({
      currentMethod: "client.api.scores.get_by_id",
      replacementMethod: "client.api.scores_v3.get_many_v3",
      replacement: "GET /api/public/v3/scores",
    });
  });

  it("uses the bare v3 route when migrating the v2 score endpoint", () => {
    expect(
      getApiMigrationGuidance(
        "GET /api/public/v2/scores/{id}",
        undefined,
        undefined,
      ),
    ).toEqual({
      replacement: "GET /api/public/v3/scores",
    });
  });

  it("uses bare observation guidance for the legacy ID lookup", () => {
    expect(
      getApiMigrationGuidance(
        "GET /api/public/observations/{id}",
        "javascript",
        "5.5.0",
      ),
    ).toMatchObject({
      replacementMethod: "client.api.observations.getMany",
      replacement: "GET /api/public/v2/observations",
    });
  });

  it("points daily metrics at the v2 metrics endpoint", () => {
    expect(
      getApiMigrationGuidance(
        "GET /api/public/metrics/daily",
        undefined,
        undefined,
      ),
    ).toEqual({
      replacement: "GET /api/public/v2/metrics",
    });
  });

  it("uses bare metrics guidance", () => {
    expect(
      getApiMigrationGuidance("GET /api/public/metrics", "python", "4.8.1"),
    ).toMatchObject({
      replacementMethod: "client.api.metrics.metrics",
      replacement: "GET /api/public/v2/metrics",
    });
  });

  it("uses bare observation guidance when migrating session listing", () => {
    expect(
      getApiMigrationGuidance(
        "GET /api/public/sessions",
        "javascript",
        "5.5.0",
      ),
    ).toMatchObject({
      currentMethod: "client.api.sessions.list",
      replacementMethod: "client.api.observations.getMany",
      replacement: "GET /api/public/v2/observations",
    });
  });

  it("uses bare observation guidance when migrating a session lookup", () => {
    expect(
      getApiMigrationGuidance(
        "GET /api/public/sessions/{id}",
        "python",
        "4.8.1",
      ),
    ).toMatchObject({
      currentMethod: "client.api.sessions.get",
      replacementMethod: "client.api.observations.get_many",
      replacement: "GET /api/public/v2/observations",
    });
  });

  it("recognizes a v-prefixed outdated SDK version", () => {
    expect(
      getApiMigrationGuidance(
        "GET /api/public/traces/{id}",
        "python",
        "v3.9.0",
      ),
    ).toMatchObject({ requiresUpgrade: true, minimumVersion: "4.0.0" });
  });

  it("shows the minimum SDK version when the attributed version is unknown", () => {
    expect(
      getApiMigrationGuidance(
        "GET /api/public/v2/scores",
        "javascript",
        undefined,
      ),
    ).toMatchObject({ requiresUpgrade: true, minimumVersion: "5.5.0" });
  });

  it("returns REST guidance without inventing an SDK method", () => {
    expect(
      getApiMigrationGuidance("GET /api/public/traces", undefined, undefined),
    ).toEqual({
      replacement: "GET /api/public/v2/observations",
    });
  });

  it.each([
    "GET /api/public/dataset-run-items",
    "GET /api/public/datasets/{datasetName}/runs/{runName}",
  ])("uses the bare experiment-items method for %s", (entrypoint) => {
    expect(
      getApiMigrationGuidance(entrypoint, "javascript", "5.5.0"),
    ).toMatchObject({
      replacementMethod: "client.api.experiments.listItems",
    });
  });

  it("uses the bare experiments method when listing experiments", () => {
    expect(
      getApiMigrationGuidance(
        "GET /api/public/datasets/{datasetName}/runs",
        "python",
        "4.8.1",
      ),
    ).toMatchObject({
      replacementMethod: "client.api.experiments.list",
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
