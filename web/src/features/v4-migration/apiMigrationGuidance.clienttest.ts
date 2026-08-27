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

  it("preserves the score ID when migrating the v2 score endpoint", () => {
    expect(
      getApiMigrationGuidance(
        "GET /api/public/v2/scores/{id}",
        undefined,
        undefined,
      ),
    ).toEqual({
      replacement: "GET /api/public/v3/scores?id=<score id>",
    });
  });

  it("bounds the observation ID lookup by time", () => {
    expect(
      getApiMigrationGuidance(
        "GET /api/public/observations/{id}",
        "javascript",
        "5.5.0",
      ),
    ).toMatchObject({
      replacementMethod:
        'client.api.observations.getMany({ filter: "<id filter>", fromStartTime, toStartTime })',
      replacement:
        "GET /api/public/v2/observations?filter=<id filter>&fromStartTime=<from>&toStartTime=<to>",
    });
  });

  it("includes the required v2 query when migrating daily metrics", () => {
    expect(
      getApiMigrationGuidance(
        "GET /api/public/metrics/daily",
        undefined,
        undefined,
      ),
    ).toEqual({
      replacement:
        "GET /api/public/v2/metrics?query=<URL-encoded JSON with view, metrics, fromTimestamp, and toTimestamp>",
    });
  });

  it("warns that trace metrics have no drop-in v2 replacement", () => {
    expect(
      getApiMigrationGuidance("GET /api/public/metrics", "python", "4.8.1"),
    ).toMatchObject({
      replacementMethod: expect.stringContaining(
        "traces view has no drop-in v2 replacement",
      ),
      replacement: expect.stringContaining(
        "traces view has no drop-in v2 replacement",
      ),
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

  it("preserves the session ID and time bounds when migrating session lookup", () => {
    expect(
      getApiMigrationGuidance(
        "GET /api/public/sessions/{id}",
        "python",
        "4.8.1",
      ),
    ).toMatchObject({
      currentMethod: "client.api.sessions.get(...)",
      replacementMethod:
        'client.api.observations.get_many(filter="<sessionId filter>", from_start_time=..., to_start_time=...)',
      replacement:
        "GET /api/public/v2/observations?filter=<sessionId filter>&fromStartTime=<from>&toStartTime=<to>",
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
