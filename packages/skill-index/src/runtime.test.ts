import { describe, expect, it } from "vitest";

import {
  readSkillInIndex,
  searchSkillInIndex,
  type SkillIndexSkill,
  type SkillSearchIndexData,
} from "./runtime";

const instrumentationSkill: SkillIndexSkill = {
  id: "instrumentation",
  title: "Instrumentation",
  content: "# Instrumentation\n\nTrace SDK setup and spans.",
};

const fixtureIndex: SkillSearchIndexData = {
  chunks: [
    {
      id: "instrumentation-1",
      skillIndex: "instrumentation",
      title: "Instrumentation",
      heading: "Instrumentation",
      index: 0,
      startLine: 1,
      endLine: 3,
      content: "# Instrumentation\n\nTrace SDK setup and spans.",
      terms: {
        instrumentation: 2,
        trace: 1,
        sdk: 1,
        setup: 1,
        and: 1,
        spans: 1,
      },
      length: 8,
    },
    {
      id: "judge-calibration-1",
      skillIndex: "judge-calibration",
      title: "Judge Calibration",
      heading: "Judge Calibration",
      index: 0,
      startLine: 1,
      endLine: 3,
      content:
        "# Judge Calibration\n\nCalibrate evaluator judges with examples.",
      terms: {
        judge: 3,
        calibration: 3,
        calibrate: 1,
        constructor: 1,
        evaluator: 1,
        judges: 1,
        with: 1,
        examples: 1,
      },
      length: 11,
    },
  ],
  search: {
    averageDocumentLength: 9.5,
    idf: {
      trace: Math.log(2),
      setup: Math.log(2),
      constructor: Math.log(2),
    },
  },
};

describe("skill index runtime", () => {
  it("ranks matching chunks with snippets and metadata", () => {
    expect(
      searchSkillInIndex({ query: "trace setup", index: fixtureIndex }),
    ).toMatchObject([
      {
        id: "instrumentation",
        title: "Instrumentation",
        heading: "Instrumentation",
        snippet: "# Instrumentation\n\nTrace SDK setup and spans.",
      },
    ]);
  });

  it("handles query terms that collide with object prototype properties", () => {
    expect(
      searchSkillInIndex({ query: "constructor", index: fixtureIndex }),
    ).toMatchObject([
      {
        id: "judge-calibration",
        title: "Judge Calibration",
      },
    ]);
  });

  it("reads embedded skills", () => {
    expect(
      readSkillInIndex({
        skill: instrumentationSkill,
      }),
    ).toMatchObject({ id: "instrumentation", title: "Instrumentation" });
  });
});
