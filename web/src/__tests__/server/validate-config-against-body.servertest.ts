/** @jest-environment node */

import {
  validateConfigAgainstBody,
  type ScoreConfigDomain,
  type ScoreDomain,
} from "@langfuse/shared/src/server";

const baseTextConfig: ScoreConfigDomain = {
  id: "config-1",
  name: "free-text-config",
  dataType: "TEXT",
  isArchived: false,
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  projectId: "project-1",
  maxValue: undefined,
  minValue: undefined,
  categories: undefined,
};

const baseTextScore: ScoreDomain = {
  id: "score-1",
  projectId: "project-1",
  name: "free-text-config",
  value: 0,
  stringValue: "Some valid free text",
  dataType: "TEXT",
  source: "ANNOTATION",
  comment: null,
  metadata: {},
  configId: "config-1",
  queueId: null,
  executionTraceId: null,
  authorUserId: null,
  environment: "default",
  createdAt: new Date(),
  updatedAt: new Date(),
  timestamp: new Date(),
  traceId: "trace-1",
  sessionId: null,
  observationId: null,
  datasetRunId: null,
  longStringValue: "",
};

describe("validateConfigAgainstBody for TEXT scores", () => {
  it("should succeed with valid TEXT annotation score", () => {
    expect(() =>
      validateConfigAgainstBody({
        body: baseTextScore,
        config: baseTextConfig,
        context: "ANNOTATION",
      }),
    ).not.toThrow();
  });

  it("should reject empty TEXT text", () => {
    const emptyScore: ScoreDomain = {
      ...baseTextScore,
      stringValue: "",
    };

    expect(() =>
      validateConfigAgainstBody({
        body: emptyScore,
        config: baseTextConfig,
        context: "ANNOTATION",
      }),
    ).toThrow();
  });

  it("should reject TEXT text exceeding 500 characters", () => {
    const longScore: ScoreDomain = {
      ...baseTextScore,
      stringValue: "a".repeat(501),
    };

    expect(() =>
      validateConfigAgainstBody({
        body: longScore,
        config: baseTextConfig,
        context: "ANNOTATION",
      }),
    ).toThrow();
  });

  it("should accept TEXT text at exactly 500 characters", () => {
    const maxLengthScore: ScoreDomain = {
      ...baseTextScore,
      stringValue: "a".repeat(500),
    };

    expect(() =>
      validateConfigAgainstBody({
        body: maxLengthScore,
        config: baseTextConfig,
        context: "ANNOTATION",
      }),
    ).not.toThrow();
  });

  it("should reject archived config", () => {
    const archivedConfig: ScoreConfigDomain = {
      ...baseTextConfig,
      isArchived: true,
    };

    expect(() =>
      validateConfigAgainstBody({
        body: baseTextScore,
        config: archivedConfig,
        context: "ANNOTATION",
      }),
    ).toThrow("Config is archived");
  });

  it("should reject name mismatch", () => {
    const mismatchedScore: ScoreDomain = {
      ...baseTextScore,
      name: "different-name",
    };

    expect(() =>
      validateConfigAgainstBody({
        body: mismatchedScore,
        config: baseTextConfig,
        context: "ANNOTATION",
      }),
    ).toThrow("Name mismatch");
  });
});
