import type { ColumnDefinition, FilterState } from "@langfuse/shared";
import {
  createFieldRegistry,
  fieldRegistryFromColumns,
  withFieldOptions,
} from "@/src/features/search-bar/lib/fields";

export const TOPIC_ASSIGNMENT_OPTIONS = [
  { value: "assigned", displayValue: "In a topic" },
  { value: "outlier", displayValue: "Outlier" },
  { value: "no_topic", displayValue: "No topic" },
  { value: "awaiting_map", displayValue: "Awaiting update" },
];

export function createTopicTraceRegistry(
  topics: readonly { id: string; name: string }[],
  filters: FilterState = [],
) {
  const topicOptions = withUnavailableTopicOptions(
    buildTopicOptions(topics),
    filters,
  );
  const columns: ColumnDefinition[] = [
    {
      id: "topicId",
      name: "Topic",
      type: "stringOptions",
      internal: "topicId",
      options: topicOptions,
    },
    {
      id: "assignment",
      name: "Assignment state",
      type: "stringOptions",
      internal: "assignment",
      options: TOPIC_ASSIGNMENT_OPTIONS,
    },
  ];
  const baseRegistry = fieldRegistryFromColumns(columns, {
    id: "topics",
    allowFreeText: true,
    aiFilterPrompt: false,
    defaultSearchType: ["id"],
    freeTextScopeLabel: "summaries, topic names and trace IDs",
    searchExamples: ['assignment:"Outlier"', 'topic:"Billing questions"'],
    fields: {
      assignment: { aliases: ["state", "status"] },
    },
    filterStateErrors: (filters) =>
      filters.some((filter) => filter.type !== "stringOptions")
        ? [
            "Topics support exact topic and assignment selections. Use the search field for text matching.",
          ]
        : [],
  });
  const registry = createFieldRegistry({
    ...baseRegistry,
    fields: baseRegistry.fields.map((field) =>
      field.id === "topicId"
        ? {
            ...field,
            id: "topic",
            aliases: ["topicId"],
            filterColumn: "topicId",
          }
        : field,
    ),
  });
  return withFieldOptions(
    withFieldOptions(registry, "topic", topicOptions),
    "assignment",
    TOPIC_ASSIGNMENT_OPTIONS,
  );
}

export function selectTopicTraceFilters(
  filters: FilterState,
  topicId: string | null,
): FilterState {
  if (topicId === null) return filters;
  if (topicId === "outliers")
    return [
      {
        column: "assignment",
        type: "stringOptions",
        operator: "any of",
        value: ["outlier"],
      },
    ];
  const selected = filters[0];
  if (
    filters.length === 1 &&
    selected?.column === "topicId" &&
    selected.type === "stringOptions" &&
    selected.operator === "any of" &&
    selected.value.length === 1 &&
    selected.value[0] === topicId
  )
    return [];
  return [
    {
      column: "topicId",
      type: "stringOptions",
      operator: "any of",
      value: [topicId],
    },
  ];
}

export function filterTopicTraces<Row extends TopicTraceRow>(
  rows: readonly Row[],
  filters: FilterState,
  searchQuery: string | null,
): Row[] {
  const phrase = searchQuery?.trim().toLowerCase() ?? "";
  return rows.filter((row) => {
    if (
      phrase &&
      ![row.summary, row.topicName, row.traceId].some((value) =>
        value?.toLowerCase().includes(phrase),
      )
    )
      return false;
    return filters.every((filter) => {
      if (filter.type !== "stringOptions") return false;
      if (filter.column !== "topicId" && filter.column !== "assignment")
        return false;
      const value =
        filter.column === "topicId"
          ? row.topicId
          : getTopicAssignment(row.outcome);
      const matches = value !== null && filter.value.includes(value);
      return filter.operator === "any of" ? matches : !matches;
    });
  });
}

export function getTopicAssignment(outcome: string) {
  if (
    outcome === "assigned" ||
    outcome === "outlier" ||
    outcome === "awaiting_map"
  )
    return outcome;
  return "no_topic";
}

function buildTopicOptions(topics: readonly { id: string; name: string }[]) {
  const nameCounts = new Map<string, number>();
  for (const topic of topics)
    nameCounts.set(topic.name, (nameCounts.get(topic.name) ?? 0) + 1);
  return topics.map((topic) => ({
    value: topic.id,
    displayValue:
      (nameCounts.get(topic.name) ?? 0) > 1
        ? `${topic.name} (${topic.id})`
        : topic.name,
  }));
}

function withUnavailableTopicOptions(
  options: readonly { value: string; displayValue: string }[],
  filters: FilterState,
) {
  const topicOptions = [...options];
  const topicIds = new Set(options.map((option) => option.value));
  const labels = new Set(options.map((option) => option.displayValue));
  for (const filter of filters) {
    if (filter.column !== "topicId" || filter.type !== "stringOptions")
      continue;
    for (const id of filter.value) {
      if (topicIds.has(id)) continue;
      let displayValue = `Unavailable topic (${id})`;
      while (labels.has(displayValue)) displayValue += ` (${id})`;
      topicOptions.push({ value: id, displayValue });
      topicIds.add(id);
      labels.add(displayValue);
    }
  }
  return topicOptions;
}

type TopicTraceRow = {
  traceId: string;
  summary: string | null;
  topicId: string | null;
  topicName: string | null;
  outcome: string;
};
