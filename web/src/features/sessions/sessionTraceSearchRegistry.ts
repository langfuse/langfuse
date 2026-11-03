import { sessionTraceFilterColumns } from "@langfuse/shared";
import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";

export const SESSION_TRACE_FIELD_REGISTRY = fieldRegistryFromColumns(
  sessionTraceFilterColumns.filter((column) =>
    ["name", "traceName", "type", "level", "isRootObservation"].includes(
      column.id,
    ),
  ),
  {
    id: "sessionTraces",
    allowFreeText: false,
    defaultSearchType: [],
    metadata: false,
    searchPlaceholder: "Filter observations… e.g. level:=ERROR",
    searchExamples: [
      "name:=agent",
      "traceName:=chat",
      "type:=GENERATION",
      "level:=ERROR",
      "isRootObservation:true",
    ],
    fields: {
      name: { aliases: ["observationName"] },
    },
    filterStateErrors: (filters) =>
      filters.every((filter) => {
        if (filter.column === "isRootObservation")
          return filter.type === "boolean" && filter.operator === "=";
        if (
          filter.type === "stringOptions" &&
          (filter.column === "name" || filter.column === "traceName")
        )
          return filter.operator === "none of";
        if (filter.type !== "string") return false;
        if (filter.column === "name" || filter.column === "traceName")
          return ["=", "contains", "does not contain"].includes(
            filter.operator,
          );
        return (
          ["type", "level"].includes(filter.column) && filter.operator === "="
        );
      })
        ? []
        : ["These filters are not supported for session observations."],
  },
);
