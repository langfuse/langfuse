import {
  encodeFiltersGeneric,
  type FilterState,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared";

export function ruleExecutionsUrl(projectId: string, ruleId: string) {
  const filter: FilterState = [
    {
      column: "ruleId",
      type: "stringOptions",
      operator: "any of",
      value: [ruleId],
    },
    {
      column: "environment",
      type: "stringOptions",
      operator: "any of",
      value: [
        LangfuseInternalTraceEnvironment.CodeEval,
        LangfuseInternalTraceEnvironment.LLMJudge,
      ],
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
