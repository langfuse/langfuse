import {
  LangfuseInternalTraceEnvironment,
  type FilterState,
} from "@langfuse/shared";

import { encodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";

export function getEvaluationRuleTracesHref({
  projectId,
  evaluatorId,
  ruleId,
}: {
  projectId: string;
  evaluatorId?: string;
  ruleId?: string;
}) {
  const filter: FilterState = [
    {
      column: "environment",
      type: "stringOptions",
      operator: "any of",
      value: [
        LangfuseInternalTraceEnvironment.LLMJudge,
        LangfuseInternalTraceEnvironment.CodeEval,
      ],
    },
    ...(evaluatorId
      ? [
          {
            column: "metadata" as const,
            type: "stringObject" as const,
            key: "job_configuration_id",
            operator: "=" as const,
            value: evaluatorId,
          },
        ]
      : []),
    ...(ruleId
      ? [
          {
            column: "metadata" as const,
            type: "stringObject" as const,
            // Trace metadata is a persisted compatibility contract.
            key: "run_scope_id",
            operator: "=" as const,
            value: ruleId,
          },
        ]
      : []),
  ];

  return {
    pathname: `/project/${projectId}/traces`,
    query: { filter: encodeFiltersGeneric(filter) },
  };
}
