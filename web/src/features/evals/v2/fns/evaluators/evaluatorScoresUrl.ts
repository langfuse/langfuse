import {
  type EvalTemplateType,
  EvalTemplateTypeEnum,
  type FilterState,
  LangfuseInternalTraceEnvironment,
  encodeFiltersGeneric,
} from "@langfuse/shared";

export function evaluatorScoresUrl(projectId: string, name: string) {
  const filter: FilterState = [
    {
      column: "name",
      type: "stringOptions",
      operator: "any of",
      value: [name],
    },
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
  evaluatorName: string,
  evaluatorType: EvalTemplateType,
) {
  const environment =
    evaluatorType === EvalTemplateTypeEnum.CODE
      ? LangfuseInternalTraceEnvironment.CodeEval
      : LangfuseInternalTraceEnvironment.LLMJudge;
  const filter: FilterState = [
    {
      column: "traceName",
      type: "stringOptions",
      operator: "any of",
      value: [`Execute evaluator: ${evaluatorName}`],
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
  return `/project/${encodeURIComponent(projectId)}/traces?filter=${encodeURIComponent(encodeFiltersGeneric(filter))}`;
}
