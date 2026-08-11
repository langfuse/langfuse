import { type FilterState, encodeFiltersGeneric } from "@langfuse/shared";

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
  return `/project/${projectId}/scores?filter=${encodeURIComponent(encodeFiltersGeneric(filter))}`;
}

export function evaluatorExecutionsUrl(projectId: string, evaluatorId: string) {
  const filter: FilterState = [
    {
      column: "evaluatorId",
      type: "stringOptions",
      operator: "any of",
      value: [evaluatorId],
    },
  ];
  return `/project/${encodeURIComponent(projectId)}/traces?filter=${encodeURIComponent(encodeFiltersGeneric(filter))}`;
}
