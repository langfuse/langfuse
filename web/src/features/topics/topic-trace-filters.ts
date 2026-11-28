import type { ColumnDefinition, FilterState } from "@langfuse/shared";
import { type TopicTraceQuery } from "./facet-topics";
import { UNASSIGNED_TOPIC_ID } from "./prepare-topic-display";
import { topicRuleFilterError } from "@langfuse/shared/topics";
import {
  createFieldRegistry,
  fieldRegistryFromColumns,
  withFieldOptions,
} from "@/src/features/search-bar/lib/fields";
import { quoteIfNeeded } from "@/src/features/search-bar/lib/quoting";
import { topicsFilterRegistry } from "./useTopicTraceFilter";

export const TOPIC_ASSIGNMENT_OPTIONS = [
  { value: "assigned", displayValue: "In a topic" },
  { value: "outlier", displayValue: "Outlier" },
  { value: "no_topic", displayValue: "No topic" },
  { value: "awaiting_map", displayValue: "Awaiting update" },
];

export function createTopicTraceRegistry(
  facetName?: string,
  {
    traceFields = false,
  }: {
    /** Adds the trace fields a rule filters on, matched on the server. */
    traceFields?: boolean;
  } = {},
) {
  const topicsColumn: ColumnDefinition = {
    id: "topics",
    name: "Topics",
    type: "categoryOptions",
    internal: "topics",
    options: [],
  };
  const assignmentColumn: ColumnDefinition = {
    id: "assignment",
    name: "Assignment state",
    type: "stringOptions",
    internal: "assignment",
    options: TOPIC_ASSIGNMENT_OPTIONS,
  };
  const topicRegistry = fieldRegistryFromColumns([assignmentColumn], {
    id: "topics",
    fields: {
      assignment: { aliases: ["state", "status"] },
    },
  });
  const traceRegistry = traceFields ? topicsFilterRegistry : null;
  // A later alias wins in the registry, so trace fields must not claim a topic field's name.
  const topicNames = new Set(
    ["topics"]
      .concat(topicRegistry.fields.flatMap((f) => [f.id, ...f.aliases]))
      .map((name) => name.toLowerCase()),
  );
  const exampleFacet = facetName ? quoteIfNeeded(facetName) : "Intent";
  // The view reads plain filters, not a predicate.
  const registry = createFieldRegistry({
    ...(traceRegistry ?? topicRegistry),
    id: "topics",
    predicateSource: null,
    keyedOptionNamespaces: { topics: "topics" },
    fields: [
      ...topicRegistry.fields,
      ...(traceRegistry?.fields ?? []).map((field) => ({
        ...field,
        aliases: field.aliases.filter(
          (alias) => !topicNames.has(alias.toLowerCase()),
        ),
      })),
    ],
    columns: [
      topicsColumn,
      ...topicRegistry.columns,
      ...(traceRegistry?.columns ?? []),
    ],
    allowFreeText: true,
    aiFilterPrompt: false,
    defaultSearchType: ["id"],
    freeTextScopeLabel: "topic names and exact trace IDs",
    searchExamples: [
      `topics.${exampleFacet}:"Billing questions"`,
      'assignment:"Outlier"',
      ...(traceRegistry?.searchExamples ?? []),
    ],
    filterStateErrors: (filters) => {
      const [topicFilters, traceFilters] = splitTopicTraceFilters(filters);
      const traceError = traceRegistry
        ? topicRuleFilterError(traceFilters)
        : traceFilters.length > 0 &&
          "This view filters by topic and assignment state only.";
      return [
        ...(topicFilters.some(
          (filter) =>
            (filter.column === "topics" && filter.type !== "categoryOptions") ||
            (filter.column === "assignment" && filter.type !== "stringOptions"),
        )
          ? ["Topics and assignment states take exact selections."]
          : []),
        ...(facetName &&
        topicFilters.some(
          (filter) =>
            filter.column === "topics" &&
            filter.type === "categoryOptions" &&
            filter.key !== facetName,
        )
          ? [`This view filters by topics.${quoteIfNeeded(facetName)} only.`]
          : []),
        ...(traceError ? [traceError] : []),
      ];
    },
  });
  return withFieldOptions(registry, "assignment", TOPIC_ASSIGNMENT_OPTIONS);
}

const TOPIC_COLUMNS = new Set(["topics", "assignment"]);

/** Topic and assignment filters run on topic results; the rest are tracing filters on the trace. */
export function splitTopicTraceFilters(
  filters: FilterState,
): [FilterState, FilterState] {
  return [
    filters.filter((filter) => TOPIC_COLUMNS.has(filter.column)),
    filters.filter((filter) => !TOPIC_COLUMNS.has(filter.column)),
  ];
}

/** One topic picked in the list, treemap, or scatter, as a search-bar filter; null picks unassigned traces. */
export function pickedTopicFilters(
  facet: TopicFilterFacet,
  topicId: string | null,
): FilterState {
  if (topicId === null)
    return [
      {
        column: "assignment",
        type: "stringOptions",
        operator: "none of",
        value: ["assigned"],
      },
    ];
  const label = topicFilterIndex(facet.topics).labelById.get(topicId);
  if (label === undefined) return [];
  return [
    {
      column: "topics",
      type: "categoryOptions",
      key: facet.name,
      operator: "any of",
      value: [label],
    },
  ];
}

/** Display/filter values for a facet's topics, appending `(<stable_id>)` only when names collide. */
export function topicFilterLabels(
  topics: readonly { id: string; name: string }[],
): string[] {
  const { labelById } = topicFilterIndex(topics);
  return topics.map((topic) => labelById.get(topic.id) ?? topic.name);
}

/** The topic the search bar holds when it is exactly one picked topic on this facet. */
export function pickedTopicId(
  filters: FilterState,
  facet: TopicFilterFacet,
  searchQuery: string | null = null,
): string | null {
  if (searchQuery?.trim() || filters.length !== 1) return null;
  const [filter] = filters;
  if (
    filter?.column === "topics" &&
    filter.type === "categoryOptions" &&
    filter.key === facet.name &&
    filter.operator === "any of" &&
    filter.value.length === 1
  ) {
    const matches = resolveTopicFilterValue(
      filter.value[0]!,
      topicFilterIndex(facet.topics),
    );
    return matches.length === 1 ? matches[0]! : null;
  }
  if (
    filter?.column === "assignment" &&
    filter.type === "stringOptions" &&
    filter.operator === "none of" &&
    filter.value.length === 1 &&
    filter.value[0] === "assigned"
  )
    return UNASSIGNED_TOPIC_ID;
  return null;
}

export function filterTopicTraces<Row extends TopicTraceRow>(
  rows: readonly Row[],
  filters: FilterState,
  searchQuery: string | null,
  facet: TopicFilterFacet,
): Row[] {
  const phrase = searchQuery?.trim() ?? "";
  const index = topicFilterIndex(facet.topics);
  return rows.filter((row) => {
    if (phrase && !matchesSearch(row, phrase)) return false;
    return splitTopicTraceFilters(filters)[0].every((filter) => {
      if (filter.column === "topics") {
        if (filter.type !== "categoryOptions" || filter.key !== facet.name)
          return false;
        const matchedIds = new Set(
          filter.value.flatMap((value) =>
            resolveTopicFilterValue(value, index),
          ),
        );
        const matches = row.topicId !== null && matchedIds.has(row.topicId);
        return filter.operator === "any of" ? matches : !matches;
      }
      if (filter.column === "assignment") {
        if (filter.type !== "stringOptions") return false;
        const matches = filter.value.includes(getTopicAssignment(row.outcome));
        return filter.operator === "any of" ? matches : !matches;
      }
      return false;
    });
  });
}

/** Same matching as the server: a topic name containing the phrase, or the exact trace ID. */
function matchesSearch(
  row: Pick<TopicTraceRow, "traceId" | "topicName">,
  phrase: string,
) {
  return (
    row.traceId === phrase ||
    Boolean(row.topicName?.toLowerCase().includes(phrase.toLowerCase()))
  );
}

const STATUSES_BY_ASSIGNMENT = {
  assigned: ["assigned"],
  outlier: ["outlier"],
  awaiting_map: ["awaiting_map"],
  no_topic: [
    "not_applicable",
    "insufficient_input",
    "empty_input",
    "input_too_large",
  ],
} as const;
type ServerStatus =
  (typeof STATUSES_BY_ASSIGNMENT)[keyof typeof STATUSES_BY_ASSIGNMENT][number];

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
  facet: TopicFilterFacet,
  { assignedOnly = false }: { assignedOnly?: boolean } = {},
): TopicTraceQuery | null {
  const query: TopicTraceQuery = assignedOnly ? { assigned: true } : {};
  const [topicFilters, traceFilters] = splitTopicTraceFilters(filters);
  if (traceFilters.length > 0) query.filter = traceFilters;

  const index = topicFilterIndex(facet.topics);

  let include: Set<string> | undefined;
  const exclude = new Set<string>();
  for (const filter of topicFilters) {
    if (filter.column !== "topics") continue;
    if (filter.type !== "categoryOptions" || filter.key !== facet.name)
      return null;
    const ids = filter.value.flatMap((value) =>
      resolveTopicFilterValue(value, index),
    );
    if (filter.operator === "none of") {
      ids.forEach((id) => exclude.add(id));
    } else {
      include = new Set(ids.filter((id) => !include || include.has(id)));
    }
  }

  const phrase = searchQuery?.trim() ?? "";
  if (phrase) {
    const named = facet.topics
      .filter((topic) =>
        topic.name.toLowerCase().includes(phrase.toLowerCase()),
      )
      .map((topic) => topic.id);
    if (named.length > 0)
      include = new Set(named.filter((id) => !include || include.has(id)));
    else query.traceId = phrase;
  }
  if (include) {
    const values = [...include].filter((id) => !exclude.has(id));
    if (values.length === 0) return null;
    query.topicIds = { operator: "any of", values };
  } else if (exclude.size > 0) {
    query.topicIds = {
      operator: "none of",
      values: [...exclude],
    };
  }

  const assignment = selection(topicFilters, "assignment");
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

/** @internal */
export function getTopicAssignment(outcome: string) {
  if (
    outcome === "assigned" ||
    outcome === "outlier" ||
    outcome === "awaiting_map"
  )
    return outcome;
  return "no_topic";
}

type TopicFilterIndex = {
  labelById: Map<string, string>;
  idByLabel: Map<string, string>;
  idsByName: Map<string, string[]>;
};

function topicFilterIndex(
  topics: readonly { id: string; name: string }[],
): TopicFilterIndex {
  const nameCounts = new Map<string, number>();
  for (const topic of topics) {
    nameCounts.set(topic.name, (nameCounts.get(topic.name) ?? 0) + 1);
  }
  const taken = new Set(
    topics
      .filter((topic) => (nameCounts.get(topic.name) ?? 0) === 1)
      .map((topic) => topic.name),
  );
  const labelById = new Map<string, string>();
  const idByLabel = new Map<string, string>();
  const idsByName = new Map<string, string[]>();
  for (const topic of topics) {
    const ids = idsByName.get(topic.name) ?? [];
    ids.push(topic.id);
    idsByName.set(topic.name, ids);
    const duplicate = (nameCounts.get(topic.name) ?? 0) > 1;
    let label = duplicate ? `${topic.name} (${topic.id})` : topic.name;
    if (duplicate) {
      while (taken.has(label)) label += ` (${topic.id})`;
      taken.add(label);
    }
    labelById.set(topic.id, label);
    idByLabel.set(label, topic.id);
  }
  return { labelById, idByLabel, idsByName };
}

function resolveTopicFilterValue(
  value: string,
  index: TopicFilterIndex,
): string[] {
  const exactId = index.idByLabel.get(value);
  if (exactId !== undefined) return [exactId];
  return index.idsByName.get(value) ?? [];
}

type TopicFilterFacet = {
  name: string;
  topics: readonly { id: string; name: string }[];
};

type TopicTraceRow = {
  traceId: string;
  summary: string | null;
  topicId: string | null;
  topicName: string | null;
  outcome: string;
};
