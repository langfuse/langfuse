import type { ColumnDefinition, FilterState } from "@langfuse/shared";
import { type TopicTraceQuery } from "./facet-topics";
import {
  type CrossFacetTopicFilter,
  topicRuleFilterError,
} from "@langfuse/shared/topics";
import {
  createFieldRegistry,
  fieldRegistryFromColumns,
  withFieldOptions,
} from "@/src/features/search-bar/lib/fields";
import { topicsFilterRegistry } from "./useTopicTraceFilter";

export type TopicFilterFacet = {
  facetId: string;
  name: string;
  topics: readonly { id: string; name: string }[];
  map?: { topics: readonly { id: string; name: string }[] } | null;
};

export const TOPIC_ASSIGNMENT_OPTIONS = [
  { value: "assigned", displayValue: "In a topic" },
  { value: "outlier", displayValue: "Outlier" },
  { value: "no_topic", displayValue: "No topic" },
  { value: "awaiting_map", displayValue: "Awaiting update" },
];

const TOPICS_KEYED_COLUMN: ColumnDefinition = {
  id: "topics",
  name: "Topics",
  type: "categoryOptions",
  internal: "topics",
  options: [],
};

export function createTopicTraceRegistry(
  topics: readonly { id: string; name: string }[],
  filters: FilterState = [],
  {
    traceFields = false,
    crossFacetTopics = false,
    searchExamples: extraSearchExamples = [],
  }: {
    /** Adds the trace fields a rule filters on, matched on the server. */
    traceFields?: boolean;
    /** Enables `topics.<FacetName>:<Topic>` filters across facets in the same map. */
    crossFacetTopics?: boolean;
    /** Additional placeholder examples shown in the search bar. */
    searchExamples?: readonly string[];
  } = {},
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
  const topicRegistry = fieldRegistryFromColumns(columns, {
    id: "topics",
    fields: {
      assignment: { aliases: ["state", "status"] },
    },
  });
  const traceRegistry = traceFields ? topicsFilterRegistry : null;
  const hasCrossFacetTopics =
    crossFacetTopics || filters.some((filter) => filter.column === "topics");
  // A later alias wins in the registry, so trace fields must not claim a topic field's name.
  const topicNames = new Set(
    ["topic", "topicId"]
      .concat(topicRegistry.fields.flatMap((f) => [f.id, ...f.aliases]))
      .map((name) => name.toLowerCase()),
  );
  // The view reads plain filters, not a predicate.
  const registry = createFieldRegistry({
    ...(traceRegistry ?? topicRegistry),
    id: "topics",
    predicateSource: null,
    keyedOptionNamespaces: hasCrossFacetTopics
      ? { topics: "topics" }
      : undefined,
    promoteKeyedOptionKeys: hasCrossFacetTopics,
    fields: [
      ...topicRegistry.fields.map((field) =>
        field.id === "topicId"
          ? {
              ...field,
              id: "topic",
              aliases: ["topicId"],
              filterColumn: "topicId",
            }
          : field,
      ),
      ...(traceRegistry?.fields ?? []).map((field) => ({
        ...field,
        aliases: field.aliases.filter(
          (alias) => !topicNames.has(alias.toLowerCase()),
        ),
      })),
    ],
    columns: [
      ...topicRegistry.columns,
      ...(hasCrossFacetTopics ? [TOPICS_KEYED_COLUMN] : []),
      ...(traceRegistry?.columns ?? []),
    ],
    allowFreeText: true,
    aiFilterPrompt: false,
    defaultSearchType: ["id"],
    freeTextScopeLabel: "topic names and exact trace IDs",
    searchExamples: [
      'topic:"Billing questions"',
      ...extraSearchExamples,
      'assignment:"Outlier"',
      ...(traceRegistry?.searchExamples ?? []),
    ],
    filterStateErrors: (filters) => {
      const [topicFilters, traceFilters] = splitTopicTraceFilters(filters);
      const traceError = traceRegistry
        ? topicRuleFilterError(traceFilters)
        : traceFilters.length > 0 &&
          "This view filters by topic and assignment state only.";
      const invalidTopicFilter = topicFilters.some((filter) =>
        filter.column === "topics"
          ? filter.type !== "categoryOptions"
          : filter.type !== "stringOptions",
      );
      return [
        ...(invalidTopicFilter
          ? ["Topics and assignment states take exact selections."]
          : []),
        ...(traceError ? [traceError] : []),
      ];
    },
  });
  return withFieldOptions(
    withFieldOptions(registry, "topic", topicOptions),
    "assignment",
    TOPIC_ASSIGNMENT_OPTIONS,
  );
}

const TOPIC_COLUMNS = new Set(["topicId", "assignment", "topics"]);

/** Topic, cross-facet topic, and assignment filters run on topic results; the rest are tracing filters on the trace. */
function splitTopicTraceFilters(
  filters: FilterState,
): [FilterState, FilterState] {
  return [
    filters.filter((filter) => TOPIC_COLUMNS.has(filter.column)),
    filters.filter((filter) => !TOPIC_COLUMNS.has(filter.column)),
  ];
}

function orderedTopicsOf(facet: TopicFilterFacet) {
  if (!facet.map) return facet.topics;
  const mapped = facet.map.topics;
  return [
    ...mapped,
    ...facet.topics.filter(
      (topic) => !mapped.some((item) => item.id === topic.id),
    ),
  ];
}

function findTopicFilterFacet(
  facets: readonly TopicFilterFacet[],
  key: string,
  excludeFacetId?: string,
) {
  const candidates = excludeFacetId
    ? facets.filter((facet) => facet.facetId !== excludeFacetId)
    : facets;
  const exact = candidates.find((facet) => facet.name === key);
  if (exact) return exact;
  const lower = key.toLowerCase();
  return candidates.find((facet) => facet.name.toLowerCase() === lower);
}

function isFacetKeyMatch(key: string, facetName: string) {
  return key === facetName || key.toLowerCase() === facetName.toLowerCase();
}

export function resolveFacetTopicIds(
  facet: TopicFilterFacet,
  values: readonly string[],
): string[] {
  const topics = orderedTopicsOf(facet);
  const options = buildTopicOptions(topics);
  const byDisplay = new Map(
    options.map((option) => [option.displayValue, option.value]),
  );
  const byName = new Map<string, string[]>();
  for (const topic of topics) {
    const existing = byName.get(topic.name);
    if (existing) existing.push(topic.id);
    else byName.set(topic.name, [topic.id]);
  }
  const ids = new Set<string>();
  for (const value of values) {
    const exact = byDisplay.get(value);
    if (exact) {
      ids.add(exact);
    } else {
      for (const id of byName.get(value) ?? []) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Splits filters into active-facet filters, sibling-facet filters, and tracing
 * filters. `otherFacetTopics` is null when an `any of` sibling filter targets a
 * facet or topic absent from this map (matches nothing).
 */
export function partitionTopicTraceFilters(
  filters: FilterState,
  activeFacet: TopicFilterFacet | undefined,
  allFacets: readonly TopicFilterFacet[] = [],
): {
  activeFacetFilters: FilterState;
  otherFacetFilters: FilterState;
  otherFacetTopics: CrossFacetTopicFilter[] | null;
  traceFieldFilters: FilterState;
} {
  const activeFacetFilters: FilterState = [];
  const otherFacetFilters: FilterState = [];
  const traceFieldFilters: FilterState = [];
  for (const filter of filters) {
    if (filter.column === "topicId" || filter.column === "assignment") {
      activeFacetFilters.push(filter);
    } else if (filter.column === "topics") {
      if (
        filter.type === "categoryOptions" &&
        activeFacet &&
        isFacetKeyMatch(filter.key, activeFacet.name)
      ) {
        activeFacetFilters.push(filter);
      } else {
        otherFacetFilters.push(filter);
      }
    } else {
      traceFieldFilters.push(filter);
    }
  }
  const otherFacetTopics = resolveOtherFacetTopics(
    otherFacetFilters,
    activeFacet,
    allFacets,
  );
  return {
    activeFacetFilters,
    otherFacetFilters,
    otherFacetTopics,
    traceFieldFilters,
  };
}

function resolveOtherFacetTopics(
  otherFacetFilters: FilterState,
  activeFacet: TopicFilterFacet | undefined,
  allFacets: readonly TopicFilterFacet[],
): CrossFacetTopicFilter[] | null {
  const resolved: CrossFacetTopicFilter[] = [];
  for (const filter of otherFacetFilters) {
    if (filter.column !== "topics" || filter.type !== "categoryOptions")
      return null;
    if (filter.value.length === 0) continue;
    const facet = findTopicFilterFacet(
      allFacets,
      filter.key,
      activeFacet?.facetId,
    );
    if (!facet) {
      if (filter.operator === "any of") return null;
      continue;
    }
    const topicIds = resolveFacetTopicIds(facet, filter.value);
    if (topicIds.length === 0) {
      if (filter.operator === "any of") return null;
      continue;
    }
    resolved.push({
      facetId: facet.facetId,
      operator: filter.operator,
      topicIds,
    });
  }
  return resolved;
}

/**
 * Rewrites shorthand `topic:<id>` filters into explicit `topics.<FacetName>:<label>`
 * filters before switching facet tabs so the filter stays valid and readable.
 */
export function rewriteTopicIdFiltersForFacet(
  filters: FilterState,
  facet: TopicFilterFacet,
): FilterState {
  if (!filters.some((filter) => filter.column === "topicId")) return filters;
  const displayById = new Map(
    buildTopicOptions(orderedTopicsOf(facet)).map((option) => [
      option.value,
      option.displayValue,
    ]),
  );
  return filters.map((filter) => {
    if (filter.column !== "topicId" || filter.type !== "stringOptions")
      return filter;
    return {
      column: "topics",
      type: "categoryOptions",
      key: facet.name,
      operator: filter.operator,
      value: filter.value.map((id) => displayById.get(id) ?? id),
    };
  });
}

/**
 * Builds structured `topics` filters for "Open in Tracing" (v4 live maps).
 * Returns undefined when the current selection includes filters Tracing's
 * `topics` column cannot express (trace fields, assignment states, search text).
 */
export function topicTracingFilters(
  filters: FilterState,
  searchQuery: string | null,
  activeFacet: TopicFilterFacet,
  allFacets: readonly TopicFilterFacet[] = [activeFacet],
): FilterState | undefined {
  if (searchQuery?.trim()) return undefined;
  const {
    activeFacetFilters,
    otherFacetFilters,
    otherFacetTopics,
    traceFieldFilters,
  } = partitionTopicTraceFilters(filters, activeFacet, allFacets);
  if (traceFieldFilters.length > 0 || otherFacetTopics === null)
    return undefined;
  if (activeFacetFilters.some((filter) => filter.column === "assignment"))
    return undefined;
  const combined = [...activeFacetFilters, ...otherFacetFilters];
  if (combined.length === 0) return undefined;

  const activeNameById = new Map(
    orderedTopicsOf(activeFacet).map((topic) => [topic.id, topic.name]),
  );
  const out: FilterState = [];
  for (const filter of combined) {
    if (filter.column === "topicId" && filter.type === "stringOptions") {
      const names = [
        ...new Set(
          filter.value
            .map((id) => activeNameById.get(id))
            .filter((name): name is string => Boolean(name)),
        ),
      ];
      if (names.length !== filter.value.length || names.length === 0)
        return undefined;
      out.push({
        column: "topics",
        type: "categoryOptions",
        key: activeFacet.name,
        operator: filter.operator,
        value: names,
      });
    } else if (
      filter.column === "topics" &&
      filter.type === "categoryOptions"
    ) {
      if (filter.value.length === 0) continue;
      const facet = isFacetKeyMatch(filter.key, activeFacet.name)
        ? activeFacet
        : findTopicFilterFacet(allFacets, filter.key, activeFacet.facetId);
      if (!facet) {
        if (filter.operator === "any of") return undefined;
        continue;
      }
      const topicIds = resolveFacetTopicIds(facet, filter.value);
      if (topicIds.length === 0) {
        if (filter.operator === "any of") return undefined;
        continue;
      }
      const nameById = new Map(
        orderedTopicsOf(facet).map((topic) => [topic.id, topic.name]),
      );
      const names = [
        ...new Set(
          topicIds
            .map((id) => nameById.get(id))
            .filter((name): name is string => Boolean(name)),
        ),
      ];
      if (names.length === 0) return undefined;
      out.push({
        column: "topics",
        type: "categoryOptions",
        key: facet.name,
        operator: filter.operator,
        value: names,
      });
    } else {
      return undefined;
    }
  }
  return out.length > 0 ? out : undefined;
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
  activeFacet?: TopicFilterFacet,
): Row[] {
  const phrase = searchQuery?.trim() ?? "";
  const { activeFacetFilters } = partitionTopicTraceFilters(
    filters,
    activeFacet,
  );
  const resolvedActiveTopicFilters = activeFacetFilters.map((filter) => {
    if (
      filter.column === "topics" &&
      filter.type === "categoryOptions" &&
      activeFacet
    ) {
      return {
        kind: "topicId" as const,
        operator: filter.operator,
        values: new Set(resolveFacetTopicIds(activeFacet, filter.value)),
      };
    }
    if (
      filter.type === "stringOptions" &&
      (filter.column === "topicId" || filter.column === "assignment")
    ) {
      return {
        kind: filter.column,
        operator: filter.operator,
        values: new Set(filter.value),
      };
    }
    return null;
  });
  return rows.filter((row) => {
    if (phrase && !matchesSearch(row, phrase)) return false;
    return resolvedActiveTopicFilters.every((filter) => {
      if (!filter) return false;
      const value =
        filter.kind === "topicId"
          ? row.topicId
          : getTopicAssignment(row.outcome);
      const matches = value !== null && filter.values.has(value);
      return filter.operator === "any of" ? matches : !matches;
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

function activeTopicSelection(
  activeFacetFilters: FilterState,
  activeFacet?: TopicFilterFacet,
) {
  let include: Set<string> | undefined;
  const exclude = new Set<string>();
  for (const filter of activeFacetFilters) {
    let values: string[] | null = null;
    if (filter.column === "topicId" && filter.type === "stringOptions") {
      values = filter.value;
    } else if (
      filter.column === "topics" &&
      filter.type === "categoryOptions" &&
      activeFacet
    ) {
      if (filter.value.length === 0) continue;
      values = resolveFacetTopicIds(activeFacet, filter.value);
    }
    if (values === null) continue;
    if (filter.operator === "none of")
      values.forEach((value) => exclude.add(value));
    else
      include = new Set(
        values.filter((value) => !include || include.has(value)),
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
  {
    assignedOnly = false,
    activeFacet,
    allFacets = [],
  }: {
    assignedOnly?: boolean;
    activeFacet?: TopicFilterFacet;
    allFacets?: readonly TopicFilterFacet[];
  } = {},
): TopicTraceQuery | null {
  const { activeFacetFilters, otherFacetTopics, traceFieldFilters } =
    partitionTopicTraceFilters(filters, activeFacet, allFacets);
  if (otherFacetTopics === null) return null;
  const query: TopicTraceQuery = assignedOnly ? { assigned: true } : {};
  if (traceFieldFilters.length > 0) query.filter = traceFieldFilters;
  if (otherFacetTopics.length > 0) query.otherFacetTopics = otherFacetTopics;
  const topicSelection = activeTopicSelection(activeFacetFilters, activeFacet);
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

  const assignment = selection(activeFacetFilters, "assignment");
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

export function buildTopicOptions(
  topics: readonly { id: string; name: string }[],
) {
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
