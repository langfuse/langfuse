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
  const evaluatorFilter: FilterState[number] =
    evaluatorType === EvalTemplateTypeEnum.CODE
      ? {
          column: "evaluatorId",
          type: "stringOptions",
          operator: "any of",
          value: [evaluatorId],
        }
      : {
          column: "name",
          type: "stringOptions",
          operator: "any of",
          value: [evaluatorName],
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
