import {
  LangfuseInternalTraceEnvironment,
  type FilterState,
} from "@langfuse/shared";

import { encodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";

export function getRunScopeTracesHref({
  projectId,
  evaluatorId,
  runScopeId,
}: {
  projectId: string;
  evaluatorId?: string;
  runScopeId: string;
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
    {
      column: "metadata",
      type: "stringObject",
      key: "run_scope_id",
      operator: "=",
      value: runScopeId,
    },
  ];

  return {
    pathname: `/project/${projectId}/traces`,
    query: { filter: encodeFiltersGeneric(filter) },
  };
}
