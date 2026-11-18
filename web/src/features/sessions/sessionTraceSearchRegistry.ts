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
    allowPresence: false,
    defaultSearchType: [],
    metadata: false,
    searchPlaceholder: "Filter observations… e.g. level:=ERROR",
    searchExamples: [
      "name:=agent",
      "traceName:=chat",
      "type:=GENERATION",
      "type:(AGENT OR TOOL)",
      "level:=ERROR",
      "level:(ERROR OR WARNING)",
      "environment:=production",
      "environment:(production OR staging)",
      "isRootObservation:true",
    ],
    fields: {
      name: {
        aliases: ["observationName"],
        operators: ["=", "exact", "~"],
        negatedOperators: ["=", "exact", "~"],
      },
      traceName: {
        operators: ["=", "exact", "~"],
        negatedOperators: ["=", "exact", "~"],
      },
      type: {
        operators: ["=", "exact"],
        negatedOperators: [],
        suggestObservedValues: true,
        exactSuggestions: true,
      },
      level: {
        operators: ["=", "exact"],
        negatedOperators: [],
        suggestObservedValues: true,
        exactSuggestions: true,
      },
      environment: { operators: ["=", "exact"], negatedOperators: [] },
      isRootObservation: { operators: ["=", "exact"] },
    },
    filterStateErrors: (filters) =>
      sessionTraceFilterSchema.safeParse(filters).success
        ? []
        : ["These filters are not supported for session observations."],
  },
);
