import type { ColumnDefinition, FilterState } from "@langfuse/shared";
import { type TopicTraceQuery } from "./facet-topics";
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
    freeTextScopeLabel: "topic names and exact trace IDs",
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

const STATUSES_BY_ASSIGNMENT = {
  assigned: ["assigned"],
  outlier: ["outlier"],
  awaiting_map: ["awaiting_map"],
  no_topic: ["not_applicable", "insufficient_input"],
} as const;
type ServerStatus =
  (typeof STATUSES_BY_ASSIGNMENT)[keyof typeof STATUSES_BY_ASSIGNMENT][number];

function isSupportedFilter(filter: FilterState[number]) {
  return (
    filter.type === "stringOptions" &&
    (filter.column === "topicId" || filter.column === "assignment")
  );
}

/** Values every `any of` keeps, minus those any `none of` drops; undefined when unconstrained. */
function selection(filters: FilterState, column: string) {
  let include: Set<string> | undefined;
  const exclude = new Set<string>();
  for (const filter of filters) {
    if (filter.column !== column || filter.type !== "stringOptions") continue;
    if (filter.operator === "none of")
      filter.value.forEach((value) => exclude.add(value));
    else
      include = new Set(
        filter.value.filter((value) => !include || include.has(value)),
      );
  }
  return { include, exclude };
}

/**
 * The server query for the toolbar's filters and search. Returns null when
 * the selection matches nothing. Search finds topics by name, or else one
 * trace by its exact ID; summary text is not searched.
 */
export function topicTraceQuery(
  filters: FilterState,
  searchQuery: string | null,
  topics: readonly { id: string; name: string }[],
): TopicTraceQuery | null {
  // A restored filter the server cannot apply matches nothing, like an empty selection.
  if (filters.some((filter) => !isSupportedFilter(filter))) return null;
  const query: TopicTraceQuery = {};
  const topicSelection = selection(filters, "topicId");
  let include = topicSelection.include;
  const phrase = searchQuery?.trim() ?? "";
  if (phrase) {
    const named = topics
      .filter((topic) =>
        topic.name.toLowerCase().includes(phrase.toLowerCase()),
      )
      .map((topic) => topic.id);
    if (named.length > 0)
      include = new Set(named.filter((id) => !include || include.has(id)));
    else query.traceId = phrase;
  }
  if (include) {
    const values = [...include].filter((id) => !topicSelection.exclude.has(id));
    if (values.length === 0) return null;
    query.topicIds = { operator: "any of", values };
  } else if (topicSelection.exclude.size > 0)
    query.topicIds = {
      operator: "none of",
      values: [...topicSelection.exclude],
    };

  const assignment = selection(filters, "assignment");
  const expand = (values: Iterable<string>) =>
    [...values].flatMap((value): ServerStatus[] =>
      value in STATUSES_BY_ASSIGNMENT
        ? [
            ...STATUSES_BY_ASSIGNMENT[
              value as keyof typeof STATUSES_BY_ASSIGNMENT
            ],
          ]
        : [],
    );
  if (assignment.include) {
    const values = expand(
      [...assignment.include].filter((value) => !assignment.exclude.has(value)),
    );
    if (values.length === 0) return null;
    query.statuses = { operator: "any of", values };
  } else if (assignment.exclude.size > 0)
    query.statuses = {
      operator: "none of",
      values: expand(assignment.exclude),
    };
  return query;
}

/**
 * Evaluates the server query on a loaded row or map point, so highlights and
 * stories agree with the list. Map points call awaiting traces "unassigned".
 */
export function matchesTopicQuery(
  row: { traceId: string; topicId: string | null; outcome: string },
  query: TopicTraceQuery | null,
) {
  if (!query) return false;
  if (query.traceId && row.traceId !== query.traceId) return false;
  if (query.assigned !== undefined && (row.topicId !== null) !== query.assigned)
    return false;
  if (query.topicIds) {
    const listed = query.topicIds.values.includes(row.topicId ?? "");
    if ((query.topicIds.operator === "any of") !== listed) return false;
  }
  if (query.statuses) {
    const outcome = row.outcome === "unassigned" ? "awaiting_map" : row.outcome;
    const listed = (query.statuses.values as string[]).includes(outcome);
    if ((query.statuses.operator === "any of") !== listed) return false;
  }
  return true;
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
