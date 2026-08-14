import {
  decodeFiltersGeneric,
  type EvalTemplateType,
  EvalTemplateTypeEnum,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared";
import { describe, expect, it } from "vitest";
import { evaluatorExecutionsUrl } from "./evaluatorScoresUrl";

const getFilters = (evaluatorType: EvalTemplateType) => {
  const url = new URL(
    evaluatorExecutionsUrl("project/id", "evaluator-1", evaluatorType),
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
            column: "evaluatorId",
            type: "stringOptions",
            operator: "any of",
            value: ["evaluator-1"],
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
