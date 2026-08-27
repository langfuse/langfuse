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
      replacementMethod: "client.api.observations.get_many(trace_id=trace_id)",
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

  it("preserves the score ID when migrating the legacy score endpoint", () => {
    expect(
      getApiMigrationGuidance("GET /api/public/scores/{id}", "python", "4.8.1"),
    ).toMatchObject({
      currentMethod: "client.api.scores.get_by_id(...)",
      replacementMethod: "client.api.scores_v3.get_many_v3(id=score_id)",
      replacement: "GET /api/public/v3/scores?id=<score id>",
    });
  });

  it("uses a bounded observation scan when migrating session listing", () => {
    expect(
      getApiMigrationGuidance(
        "GET /api/public/sessions",
        "javascript",
        "5.5.0",
      ),
    ).toMatchObject({
      currentMethod: "client.api.sessions.list(...)",
      replacementMethod:
        "client.api.observations.getMany({ fromStartTime, toStartTime }) // group by sessionId",
      replacement:
        "GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to>, then group rows by sessionId",
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
  ])(
    "preserves dataset and renamed experiment filters for %s",
    (entrypoint) => {
      expect(
        getApiMigrationGuidance(entrypoint, "javascript", "5.5.0"),
      ).toMatchObject({
        replacementMethod:
          "client.api.experiments.listItems({ datasetId, experimentName: runName, fromStartTime })",
      });
    },
  );

  it("preserves the dataset filter when listing experiments", () => {
    expect(
      getApiMigrationGuidance(
        "GET /api/public/datasets/{datasetName}/runs",
        "python",
        "4.8.1",
      ),
    ).toMatchObject({
      replacementMethod:
        "client.api.experiments.list(dataset_id=dataset_id, from_start_time=from_start_time)",
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
