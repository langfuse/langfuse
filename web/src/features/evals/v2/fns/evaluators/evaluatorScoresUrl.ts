import {
  type EvalTemplateType,
  EvalTemplateTypeEnum,
  type FilterState,
  LangfuseInternalTraceEnvironment,
  encodeFiltersGeneric,
} from "@langfuse/shared";

export function evaluatorScoresUrl(
  projectId: string,
  evaluatorId: string,
  evaluatorName: string,
  evaluatorType: EvalTemplateType,
) {
  // Code and decision-model evaluators name their scores themselves (per
  // question for decision models), so only the evaluator ID finds them.
  // Judge scores are named after the evaluator, and name also matches judge
  // scores written before scores carried an evaluator ID.
  const evaluatorFilter: FilterState[number] =
    evaluatorType === EvalTemplateTypeEnum.LLM_AS_JUDGE
      ? {
          column: "name",
          type: "stringOptions",
          operator: "any of",
          value: [evaluatorName],
        }
      : {
          column: "evaluatorId",
          type: "stringOptions",
          operator: "any of",
          value: [evaluatorId],
        };

  const filter: FilterState = [
    evaluatorFilter,
    {
      column: "source",
      type: "stringOptions",
      operator: "any of",
      value: ["EVAL"],
    },
  ];
  return `/project/${projectId}/scores?showAllEnvironments=true&filter=${encodeURIComponent(encodeFiltersGeneric(filter))}`;
}

export function evaluatorExecutionsUrl(
  projectId: string,
  evaluatorId: string,
  evaluatorType: EvalTemplateType,
) {
  const environment =
    evaluatorType === EvalTemplateTypeEnum.CODE
      ? LangfuseInternalTraceEnvironment.CodeEval
      : LangfuseInternalTraceEnvironment.LLMJudge;
  const filter: FilterState = [
    {
      column: "evaluatorId",
      type: "stringOptions",
      operator: "any of",
      value: [evaluatorId],
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
  ];
  return `/project/${encodeURIComponent(projectId)}/traces?dateRange=7d&filter=${encodeURIComponent(encodeFiltersGeneric(filter))}`;
}
