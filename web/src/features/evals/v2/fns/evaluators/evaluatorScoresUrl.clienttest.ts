import {
  decodeFiltersGeneric,
  type EvalTemplateType,
  EvalTemplateTypeEnum,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared";
import { describe, expect, it } from "vitest";
import {
  evaluatorExecutionsUrl,
  evaluatorScoresUrl,
} from "./evaluatorScoresUrl";

describe("evaluatorScoresUrl", () => {
  it("filters code evaluator scores by evaluator ID", () => {
    const url = new URL(
      evaluatorScoresUrl(
        "project-1",
        "evaluator-id",
        "Code evaluator",
        EvalTemplateTypeEnum.CODE,
      ),
      "https://langfuse.local",
    );

    expect(url.pathname).toBe("/project/project-1/scores");
    expect(url.searchParams.get("showAllEnvironments")).toBe("true");
    expect(decodeFiltersGeneric(url.searchParams.get("filter") ?? "")).toEqual([
      {
        column: "evaluatorId",
        type: "stringOptions",
        operator: "any of",
        value: ["evaluator-id"],
      },
      {
        column: "source",
        type: "stringOptions",
        operator: "any of",
        value: ["EVAL"],
      },
    ]);
  });

  it("filters judge scores by evaluator name", () => {
    const url = new URL(
      evaluatorScoresUrl(
        "project-1",
        "evaluator-id",
        "Correctness",
        EvalTemplateTypeEnum.LLM_AS_JUDGE,
      ),
      "https://langfuse.local",
    );

    expect(decodeFiltersGeneric(url.searchParams.get("filter") ?? "")).toEqual([
      {
        column: "name",
        type: "stringOptions",
        operator: "any of",
        value: ["Correctness"],
      },
      {
        column: "source",
        type: "stringOptions",
        operator: "any of",
        value: ["EVAL"],
      },
    ]);
  });
});

const getFilters = (evaluatorType: EvalTemplateType) => {
  const url = new URL(
    evaluatorExecutionsUrl("project/id", "Quality", evaluatorType),
    "https://langfuse.local",
  );

  return {
    pathname: url.pathname,
    filters: decodeFiltersGeneric(url.searchParams.get("filter") ?? ""),
  };
};

describe("evaluatorExecutionsUrl", () => {
  it.each([
    [EvalTemplateTypeEnum.CODE, LangfuseInternalTraceEnvironment.CodeEval],
    [
      EvalTemplateTypeEnum.LLM_AS_JUDGE,
      LangfuseInternalTraceEnvironment.LLMJudge,
    ],
  ])(
    "forwards %s evaluators to their execution environment",
    (type, environment) => {
      expect(getFilters(type)).toEqual({
        pathname: "/project/project%2Fid/traces",
        filters: [
          {
            column: "traceName",
            type: "stringOptions",
            operator: "any of",
            value: ["Execute evaluator: Quality"],
          },
          {
            column: "environment",
            type: "stringOptions",
            operator: "any of",
            value: [environment],
          },
          {
            column: "isRootObservation",
            type: "boolean",
            operator: "=",
            value: true,
          },
        ],
      });
    },
  );
});
