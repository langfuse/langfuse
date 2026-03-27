/** @jest-environment node */

import {
  validateConfigAgainstBody,
  type ScoreConfigDomain,
  type ScoreDomain,
} from "@langfuse/shared/src/server";

const baseFreeFormConfig: ScoreConfigDomain = {
  id: "config-1",
  name: "free-text-config",
  dataType: "FREE_FORM",
  isArchived: false,
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  projectId: "project-1",
  maxValue: undefined,
  minValue: undefined,
  categories: undefined,
};

const baseFreeFormScore: ScoreDomain = {
  id: "score-1",
  projectId: "project-1",
  name: "free-text-config",
  value: 0,
  stringValue: "Some valid free text",
  dataType: "FREE_FORM",
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

describe("validateConfigAgainstBody for FREE_FORM scores", () => {
  it("should succeed with valid FREE_FORM annotation score", () => {
    expect(() =>
      validateConfigAgainstBody({
        body: baseFreeFormScore,
        config: baseFreeFormConfig,
        context: "ANNOTATION",
      }),
    ).not.toThrow();
  });

  it("should reject empty FREE_FORM text", () => {
    const emptyScore: ScoreDomain = {
      ...baseFreeFormScore,
      stringValue: "",
    };

    expect(() =>
      validateConfigAgainstBody({
        body: emptyScore,
        config: baseFreeFormConfig,
        context: "ANNOTATION",
      }),
    ).toThrow();
  });

  it("should reject FREE_FORM text exceeding 500 characters", () => {
    const longScore: ScoreDomain = {
      ...baseFreeFormScore,
      stringValue: "a".repeat(501),
    };

    expect(() =>
      validateConfigAgainstBody({
        body: longScore,
        config: baseFreeFormConfig,
        context: "ANNOTATION",
      }),
    ).toThrow();
  });

  it("should accept FREE_FORM text at exactly 500 characters", () => {
    const maxLengthScore: ScoreDomain = {
      ...baseFreeFormScore,
      stringValue: "a".repeat(500),
    };

    expect(() =>
      validateConfigAgainstBody({
        body: maxLengthScore,
        config: baseFreeFormConfig,
        context: "ANNOTATION",
      }),
    ).not.toThrow();
  });

  it("should reject archived config", () => {
    const archivedConfig: ScoreConfigDomain = {
      ...baseFreeFormConfig,
      isArchived: true,
    };

    expect(() =>
      validateConfigAgainstBody({
        body: baseFreeFormScore,
        config: archivedConfig,
        context: "ANNOTATION",
      }),
    ).toThrow("Config is archived");
  });

  it("should reject name mismatch", () => {
    const mismatchedScore: ScoreDomain = {
      ...baseFreeFormScore,
      name: "different-name",
    };

    expect(() =>
      validateConfigAgainstBody({
        body: mismatchedScore,
        config: baseFreeFormConfig,
        context: "ANNOTATION",
      }),
    ).toThrow("Name mismatch");
  });
});
