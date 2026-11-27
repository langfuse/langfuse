import type { ColumnDefinition, FilterState } from "@langfuse/shared";
import { orderedFacetTopics, type TopicTraceQuery } from "./facet-topics";
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

/**
 * Assigns each facet a unique search-bar key under `topics.<key>`.
 * Unique facet names stay bare; duplicate case-insensitive names append
 * ` (<facetId>)` so autocomplete, partitioning, and saved filters stay distinct.
 */
export function buildFacetFilterKeys(
  facets: readonly Pick<TopicFilterFacet, "facetId" | "name">[],
): Map<string, string> {
  const counts = new Map<string, number>();
  for (const facet of facets) {
    const lower = facet.name.toLowerCase();
    counts.set(lower, (counts.get(lower) ?? 0) + 1);
  }
  const used = new Set<string>();
  const keys = new Map<string, string>();
  for (const facet of facets) {
    const lower = facet.name.toLowerCase();
    if ((counts.get(lower) ?? 0) === 1) {
      used.add(lower);
      keys.set(facet.facetId, facet.name);
    }
  }
  for (const facet of facets) {
    if (keys.has(facet.facetId)) continue;
    let key = `${facet.name} (${facet.facetId})`;
    while (used.has(key.toLowerCase())) {
      key += ` (${facet.facetId})`;
    }
    used.add(key.toLowerCase());
    keys.set(facet.facetId, key);
  }
  return keys;
}

export function facetFilterKey(
  facet: Pick<TopicFilterFacet, "facetId" | "name">,
  allFacets: readonly Pick<TopicFilterFacet, "facetId" | "name">[] = [facet],
): string {
  const list = allFacets.some((item) => item.facetId === facet.facetId)
    ? allFacets
    : [...allFacets, facet];
  return buildFacetFilterKeys(list).get(facet.facetId) ?? facet.name;
}

function findTopicFilterFacet(
  facets: readonly TopicFilterFacet[],
  key: string,
): TopicFilterFacet | undefined {
  const keys = buildFacetFilterKeys(facets);
  const exact = facets.find((facet) => keys.get(facet.facetId) === key);
  if (exact) return exact;
  const lower = key.toLowerCase();
  const ci = facets.find(
    (facet) => keys.get(facet.facetId)?.toLowerCase() === lower,
  );
  if (ci) return ci;
  // Preserve saved `<name> (<facetId>)` filters if a same-named sibling was later removed.
  const idMatch = /\(([^()]+)\)$/.exec(key)?.[1];
  if (idMatch) {
    return facets.find((facet) => facet.facetId === idMatch);
  }
  return undefined;
}

export function resolveFacetTopicIds(
  facet: TopicFilterFacet,
  values: readonly string[],
): string[] {
  const topics = orderedFacetTopics(facet);
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
  let lookupFacets: readonly TopicFilterFacet[] = allFacets;
  if (lookupFacets.length === 0) {
    lookupFacets = activeFacet ? [activeFacet] : [];
  }
  const activeFacetFilters: FilterState = [];
  const otherFacetFilters: FilterState = [];
  const traceFieldFilters: FilterState = [];
  for (const filter of filters) {
    if (filter.column === "topicId" || filter.column === "assignment") {
      activeFacetFilters.push(filter);
    } else if (filter.column === "topics") {
      const matched =
        filter.type === "categoryOptions"
          ? findTopicFilterFacet(lookupFacets, filter.key)
          : undefined;
      if (matched && activeFacet && matched.facetId === activeFacet.facetId) {
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
    lookupFacets,
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
    const facet = findTopicFilterFacet(allFacets, filter.key);
    if (!facet || facet.facetId === activeFacet?.facetId) {
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
 * Rewrites shorthand `topic:<id>` filters into explicit `topics.<FacetKey>:<label>`
 * filters before switching facet tabs so the filter stays valid and readable.
 */
export function rewriteTopicIdFiltersForFacet(
  filters: FilterState,
  facet: TopicFilterFacet,
  allFacets: readonly TopicFilterFacet[] = [facet],
): FilterState {
  if (!filters.some((filter) => filter.column === "topicId")) return filters;
  const key = facetFilterKey(facet, allFacets);
  const displayById = new Map(
    buildTopicOptions(orderedFacetTopics(facet)).map((option) => [
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
      key,
      operator: filter.operator,
      value: filter.value.map((id) => displayById.get(id) ?? id),
    };
  });
}

/**
 * Builds structured `topics` filters for "Open in Tracing" (v4 live maps).
 * Returns undefined when the current selection includes filters Tracing's
 * `topics` column cannot express unambiguously (trace fields, assignment
 * states, search text, duplicate facet names, or a single same-named topic).
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

  const lookupFacets = allFacets.length > 0 ? allFacets : [activeFacet];
  const facetKeys = buildFacetFilterKeys(lookupFacets);
  const toTracingTopicFilter = (
    facet: TopicFilterFacet,
    operator: "any of" | "none of",
    topicIds: readonly string[],
  ) => {
    // Tracing identifies facets by bare name; duplicate facet names cannot link unambiguously.
    if (facetKeys.get(facet.facetId) !== facet.name) return undefined;
    const topics = orderedFacetTopics(facet);
    const nameById = new Map(topics.map((topic) => [topic.id, topic.name]));
    const selectedIds = new Set(topicIds);
    const names = [
      ...new Set(
        topicIds
          .map((id) => nameById.get(id))
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    if (names.length === 0) return undefined;
    // Tracing resolves topic names to every topic with that name in the facet.
    const selectedNames = new Set(names);
    if (
      topics.some(
        (topic) => selectedNames.has(topic.name) && !selectedIds.has(topic.id),
      )
    )
      return undefined;
    return {
      column: "topics",
      type: "categoryOptions" as const,
      key: facet.name,
      operator,
      value: names,
    };
  };

  const out: FilterState = [];
  for (const filter of combined) {
    if (filter.column === "topicId" && filter.type === "stringOptions") {
      if (filter.value.length === 0) return undefined;
      const topics = orderedFacetTopics(activeFacet);
      if (filter.value.some((id) => !topics.some((topic) => topic.id === id)))
        return undefined;
      const converted = toTracingTopicFilter(
        activeFacet,
        filter.operator,
        filter.value,
      );
      if (!converted) return undefined;
      out.push(converted);
    } else if (
      filter.column === "topics" &&
      filter.type === "categoryOptions"
    ) {
      if (filter.value.length === 0) continue;
      const facet = findTopicFilterFacet(lookupFacets, filter.key);
      if (!facet) {
        if (filter.operator === "any of") return undefined;
        continue;
      }
      const topicIds = resolveFacetTopicIds(facet, filter.value);
      if (topicIds.length === 0) {
        if (filter.operator === "any of") return undefined;
        continue;
      }
      const converted = toTracingTopicFilter(facet, filter.operator, topicIds);
      if (!converted) return undefined;
      out.push(converted);
    } else {
      return undefined;
    }
  }
  // Tracing's `none of` (`NOT IN`) includes unsummarized and unassigned traces;
  // require at least one positive topic filter so the link stays bounded to assigned traces.
  return out.some((filter) => filter.operator === "any of") ? out : undefined;
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
  allFacets: readonly TopicFilterFacet[] = [],
): Row[] {
  const phrase = searchQuery?.trim() ?? "";
  const { activeFacetFilters } = partitionTopicTraceFilters(
    filters,
    activeFacet,
    allFacets,
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
