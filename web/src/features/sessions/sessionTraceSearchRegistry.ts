import {
  sessionTraceFilterColumns,
  sessionTraceFilterSchema,
} from "@langfuse/shared";
import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";

export const SESSION_TRACE_FIELD_REGISTRY = fieldRegistryFromColumns(
  sessionTraceFilterColumns,
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
      "environment:=production",
      "isRootObservation:true",
    ],
    fields: {
      name: { aliases: ["observationName"] },
    },
    filterStateErrors: (filters) =>
      sessionTraceFilterSchema.safeParse(filters).success
        ? []
        : ["These filters are not supported for session observations."],
  },
);
