// @vitest-environment node

import type { FilterState } from "@langfuse/shared";
import { describe, expect, it } from "vitest";
import { astToFilterState } from "@/src/features/search-bar/lib/adapter";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { parse } from "@/src/features/search-bar/lib/langQ";
import { runSearchBarInvariants } from "@/src/features/search-bar/__tests__/searchBarInvariants";
import {
  createTopicTraceRegistry,
  filterTopicTraces,
  partitionTopicTraceFilters,
  rewriteTopicIdFiltersForFacet,
  topicTraceQuery,
  topicTracingFilters,
  getTopicAssignment,
  selectTopicTraceFilters,
  type TopicFilterFacet,
} from "./topic-trace-filters";

const topics = [
  { id: "billing", name: "Billing questions" },
  { id: "support", name: "Support" },
];
const rows = [
  {
    traceId: "trace-one",
    summary: "Refund policy for a*b",
    topicId: "billing",
    topicName: "Billing questions",
    outcome: "assigned",
  },
  {
    traceId: "trace-two",
    summary: "Refund other policy",
    topicId: "support",
    topicName: "Support",
    outcome: "assigned",
  },
  {
    traceId: "trace-three",
    summary: "Refund policy",
    topicId: null,
    topicName: null,
    outcome: "outlier",
  },
  {
    traceId: "trace-four",
    summary: null,
    topicId: null,
    topicName: null,
    outcome: "not_applicable",
  },
  {
    traceId: "trace-five",
    summary: null,
    topicId: null,
    topicName: null,
    outcome: "insufficient_input",
  },
  {
    traceId: "trace-six",
    summary: "Pending refund policy",
    topicId: null,
    topicName: null,
    outcome: "awaiting_map",
  },
];
const ids = (result: typeof rows) => result.map((row) => row.traceId);

describe("topic trace filtering", () => {
  it("turns map and card selections into canonical filters", () => {
    const activeFilters: FilterState = [
      {
        column: "topicId",
        type: "stringOptions",
        operator: "any of",
        value: ["support", "billing"],
      },
      {
        column: "assignment",
        type: "stringOptions",
        operator: "none of",
        value: ["outlier"],
      },
    ];
    expect(selectTopicTraceFilters(activeFilters, null)).toEqual(activeFilters);
    expect(selectTopicTraceFilters(activeFilters, "outliers")).toEqual([
      {
        column: "assignment",
        type: "stringOptions",
        operator: "any of",
        value: ["outlier"],
      },
    ]);
    const billing: FilterState = [
      {
        column: "topicId",
        type: "stringOptions",
        operator: "any of",
        value: ["billing"],
      },
    ];
    expect(selectTopicTraceFilters(activeFilters, "billing")).toEqual(billing);
    expect(selectTopicTraceFilters(billing, "billing")).toEqual([]);
    expect(
      selectTopicTraceFilters([...billing, activeFilters[1]!], "billing"),
    ).toEqual(billing);
    expect(
      selectTopicTraceFilters(
        [
          {
            column: "topicId",
            type: "stringOptions",
            operator: "none of",
            value: ["billing"],
          },
        ],
        "billing",
      ),
    ).toEqual(billing);
  });

  it("combines fields with AND and values within a field with OR", () => {
    const filters: FilterState = [
      {
        column: "topicId",
        type: "stringOptions",
        operator: "any of",
        value: ["billing", "support"],
      },
      {
        column: "assignment",
        type: "stringOptions",
        operator: "any of",
        value: ["assigned"],
      },
    ];
    expect(ids(filterTopicTraces(rows, filters, null))).toEqual([
      "trace-one",
      "trace-two",
    ]);
    expect(ids(filterTopicTraces(rows, filters, "trace-one"))).toEqual([
      "trace-one",
    ]);
  });

  it("excludes selected topics while retaining rows without a topic", () => {
    expect(
      ids(
        filterTopicTraces(
          rows,
          [
            {
              column: "topicId",
              type: "stringOptions",
              operator: "none of",
              value: ["billing", "support"],
            },
          ],
          null,
        ),
      ),
    ).toEqual(["trace-three", "trace-four", "trace-five", "trace-six"]);
  });

  it("groups no-topic outcomes and supports assignment exclusions", () => {
    expect(getTopicAssignment("not_applicable")).toBe("no_topic");
    expect(getTopicAssignment("insufficient_input")).toBe("no_topic");
    expect(
      ids(
        filterTopicTraces(
          rows,
          [
            {
              column: "assignment",
              type: "stringOptions",
              operator: "none of",
              value: ["assigned", "outlier"],
            },
          ],
          null,
        ),
      ),
    ).toEqual(["trace-four", "trace-five", "trace-six"]);
  });

  it("searches topic names case-insensitively and trace IDs exactly, like the server", () => {
    expect(ids(filterTopicTraces(rows, [], "BILLING QUESTIONS"))).toEqual([
      "trace-one",
    ]);
    expect(ids(filterTopicTraces(rows, [], "trace-four"))).toEqual([
      "trace-four",
    ]);
    expect(filterTopicTraces(rows, [], "TRACE-FOUR")).toEqual([]);
    expect(filterTopicTraces(rows, [], "refund policy")).toEqual([]);
  });

  it("turns filters and search into the server query, or null when nothing can match", () => {
    const topics = [
      { id: "billing", name: "Billing questions" },
      { id: "support", name: "Support" },
    ];
    const assignment = (operator: "any of" | "none of", value: string[]) => ({
      column: "assignment",
      type: "stringOptions" as const,
      operator,
      value,
    });
    expect(
      topicTraceQuery(
        [
          {
            column: "topicId",
            type: "stringOptions",
            operator: "any of",
            value: ["billing", "support"],
          },
          assignment("any of", ["no_topic"]),
        ],
        "billing",
        topics,
      ),
    ).toEqual({
      topicIds: { operator: "any of", values: ["billing"] },
      statuses: {
        operator: "any of",
        values: [
          "not_applicable",
          "insufficient_input",
          "empty_input",
          "input_too_large",
        ],
      },
    });
    expect(
      topicTraceQuery([], "trace-1", topics, { assignedOnly: true }),
    ).toEqual({ assigned: true, traceId: "trace-1" });
    expect(
      topicTraceQuery(
        [
          assignment("any of", ["assigned"]),
          assignment("none of", ["assigned"]),
        ],
        null,
        topics,
      ),
    ).toBeNull();
  });

  it("handles empty results, cleared filters and empty positive selections", () => {
    expect(filterTopicTraces([], [], null)).toEqual([]);
    expect(filterTopicTraces(rows, [], " ")).toEqual(rows);
    expect(
      filterTopicTraces(
        rows,
        [
          {
            column: "topicId",
            type: "stringOptions",
            operator: "any of",
            value: [],
          },
        ],
        null,
      ),
    ).toEqual([]);
    expect(
      filterTopicTraces(
        rows,
        [
          {
            column: "topicId",
            type: "stringOptions",
            operator: "any of",
            value: ["missing"],
          },
        ],
        null,
      ),
    ).toEqual([]);
  });
});

describe("topic search registry", () => {
  const registry = createTopicTraceRegistry(topics);

  it("round-trips readable labels to stable IDs", () => {
    const parsed = astToFilterState(
      parse('topic:"Billing questions" assignment:"In a topic"', registry).ast,
      undefined,
      registry,
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.filters).toEqual([
      {
        column: "topicId",
        type: "stringOptions",
        operator: "any of",
        value: ["billing"],
      },
      {
        column: "assignment",
        type: "stringOptions",
        operator: "any of",
        value: ["assigned"],
      },
    ]);
    const roundTrip = filterStateToQueryText(parsed.filters, {}, registry);
    expect(roundTrip.skippedFilters).toEqual([]);
    expect(roundTrip.text).toContain('topic:"Billing questions"');
    expect(roundTrip.text).not.toContain("topicId:");
    expect(
      astToFilterState(
        parse('topicId:"Billing questions" assignment:"In a topic"', registry)
          .ast,
        undefined,
        registry,
      ).filters,
    ).toEqual(parsed.filters);
    expect(
      astToFilterState(parse(roundTrip.text, registry).ast, undefined, registry)
        .filters,
    ).toEqual(parsed.filters);
  });

  it("keeps status: on the assignment state when trace fields are added", () => {
    const traceRegistry = createTopicTraceRegistry(topics, [], {
      traceFields: true,
    });
    expect(
      astToFilterState(
        parse('status:"Outlier"', traceRegistry).ast,
        undefined,
        traceRegistry,
      ).filters,
    ).toEqual([
      {
        column: "assignment",
        type: "stringOptions",
        operator: "any of",
        value: ["outlier"],
      },
    ]);
  });

  it("keeps duplicate topic labels distinct", () => {
    const duplicateRegistry = createTopicTraceRegistry([
      { id: "one", name: "Support" },
      { id: "two", name: "Support" },
    ]);
    const filters: FilterState = [
      {
        column: "topicId",
        type: "stringOptions",
        operator: "any of",
        value: ["one", "two"],
      },
    ];
    const query = filterStateToQueryText(filters, {}, duplicateRegistry);
    expect(
      astToFilterState(
        parse(query.text, duplicateRegistry).ast,
        undefined,
        duplicateRegistry,
      ).filters,
    ).toEqual(filters);
  });

  it.each([["retired"], ["billing", "retired"]])(
    "keeps saved topic selections editable when options disappear: %j",
    (...values) => {
      const filters: FilterState = [
        {
          column: "topicId",
          type: "stringOptions",
          operator: "any of",
          value: values,
        },
      ];
      const savedRegistry = createTopicTraceRegistry(topics, filters);
      const query = filterStateToQueryText(filters, {}, savedRegistry);
      expect(query.skippedFilters).toEqual([]);
      const committed = planCommit(
        `${query.text} assignment:"In a topic" invoice`,
        undefined,
        savedRegistry,
      );
      expect(committed).toMatchObject({
        status: "committed",
        filters: filters.concat({
          column: "assignment",
          type: "stringOptions",
          operator: "any of",
          value: ["assigned"],
        }),
        searchQuery: "invoice",
      });
      expect(query.text).toContain("Unavailable topic (retired)");
      expect(
        planCommit('assignment:"In a topic" invoice', undefined, savedRegistry),
      ).toMatchObject({
        status: "committed",
        filters: [
          {
            column: "assignment",
            type: "stringOptions",
            operator: "any of",
            value: ["assigned"],
          },
        ],
      });
    },
  );

  it("rejects operators and fields the local evaluator cannot apply", () => {
    for (const query of ["topic:>billing", "topic:*bill*", "summary:refund"]) {
      expect(
        astToFilterState(parse(query, registry).ast, undefined, registry)
          .errors,
        query,
      ).not.toEqual([]);
    }
  });

  it("preserves shared search-bar validation and serialization invariants", () => {
    expect(
      runSearchBarInvariants({
        name: "topics",
        registry,
        extraKeys: [],
        scoreContexts: [{}],
        fieldValues: ["billing", "Support", '"Billing questions"', "outlier"],
        freeTextValues: ["refund policy", "or", "a*b", "trace-one"],
      }),
    ).toEqual([]);
  });

  it("round-trips cross-facet topics.<FacetName> filters and partitions active vs sibling facets", () => {
    const intentFacet: TopicFilterFacet = {
      facetId: "facet-intent",
      name: "User Intent",
      topics: [
        { id: "billing", name: "Billing questions" },
        { id: "support", name: "Support" },
      ],
    };
    const sentimentFacet: TopicFilterFacet = {
      facetId: "facet-sentiment",
      name: "Sentiment",
      topics: [
        { id: "neg-1", name: "Negative" },
        { id: "neg-2", name: "Negative" },
        { id: "pos-1", name: "Positive" },
      ],
    };
    const allFacets = [intentFacet, sentimentFacet];
    const crossRegistry = createTopicTraceRegistry(intentFacet.topics, [], {
      traceFields: true,
      crossFacetTopics: true,
    });

    const parsed = astToFilterState(
      parse(
        'topics."User Intent":"Billing questions" topics.Sentiment:"Negative (neg-1)" -topics.Sentiment:Positive env:production',
        crossRegistry,
      ).ast,
      undefined,
      crossRegistry,
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.filters).toEqual([
      {
        column: "topics",
        type: "categoryOptions",
        key: "User Intent",
        operator: "any of",
        value: ["Billing questions"],
      },
      {
        column: "topics",
        type: "categoryOptions",
        key: "Sentiment",
        operator: "any of",
        value: ["Negative (neg-1)"],
      },
      {
        column: "topics",
        type: "categoryOptions",
        key: "Sentiment",
        operator: "none of",
        value: ["Positive"],
      },
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["production"],
      },
    ]);

    const partitioned = partitionTopicTraceFilters(
      parsed.filters,
      intentFacet,
      allFacets,
    );
    expect(partitioned.activeFacetFilters).toHaveLength(1);
    expect(partitioned.otherFacetFilters).toHaveLength(2);
    expect(partitioned.traceFieldFilters).toHaveLength(1);
    expect(partitioned.otherFacetTopics).toEqual([
      { facetId: "facet-sentiment", operator: "any of", topicIds: ["neg-1"] },
      { facetId: "facet-sentiment", operator: "none of", topicIds: ["pos-1"] },
    ]);

    // Client-side filtering evaluates the active facet filter and ignores sibling/trace filters.
    expect(
      ids(filterTopicTraces(rows, parsed.filters, null, intentFacet)),
    ).toEqual(["trace-one"]);

    expect(
      topicTraceQuery(parsed.filters, null, intentFacet.topics, {
        activeFacet: intentFacet,
        allFacets,
      }),
    ).toEqual({
      filter: [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
      ],
      topicIds: { operator: "any of", values: ["billing"] },
      otherFacetTopics: [
        { facetId: "facet-sentiment", operator: "any of", topicIds: ["neg-1"] },
        {
          facetId: "facet-sentiment",
          operator: "none of",
          topicIds: ["pos-1"],
        },
      ],
    });

    // Impossible positive sibling filter returns null instead of dropping the filter.
    expect(
      topicTraceQuery(
        [
          {
            column: "topics",
            type: "categoryOptions",
            key: "Sentiment",
            operator: "any of",
            value: ["Does not exist"],
          },
        ],
        null,
        intentFacet.topics,
        { activeFacet: intentFacet, allFacets },
      ),
    ).toBeNull();

    // Open in Tracing emits raw topic names when only topic filters are active.
    const topicOnlyFilters = parsed.filters.slice(0, 3);
    expect(
      topicTracingFilters(topicOnlyFilters, null, intentFacet, allFacets),
    ).toEqual([
      {
        column: "topics",
        type: "categoryOptions",
        key: "User Intent",
        operator: "any of",
        value: ["Billing questions"],
      },
      {
        column: "topics",
        type: "categoryOptions",
        key: "Sentiment",
        operator: "any of",
        value: ["Negative"],
      },
      {
        column: "topics",
        type: "categoryOptions",
        key: "Sentiment",
        operator: "none of",
        value: ["Positive"],
      },
    ]);
    // Adding a trace field filter falls back to trace IDs.
    expect(
      topicTracingFilters(parsed.filters, null, intentFacet, allFacets),
    ).toBeUndefined();

    // Shorthand topicId rewrites to topics.<ActiveFacet> on facet switch.
    expect(
      rewriteTopicIdFiltersForFacet(
        [
          {
            column: "topicId",
            type: "stringOptions",
            operator: "any of",
            value: ["billing"],
          },
        ],
        intentFacet,
      ),
    ).toEqual([
      {
        column: "topics",
        type: "categoryOptions",
        key: "User Intent",
        operator: "any of",
        value: ["Billing questions"],
      },
    ]);
  });
});
