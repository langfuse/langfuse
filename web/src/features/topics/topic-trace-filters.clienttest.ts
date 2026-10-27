// @vitest-environment node

import type { FilterState } from "@langfuse/shared";
import { describe, expect, it } from "vitest";
import { astToFilterState } from "@/src/features/search-bar/lib/adapter";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { parse } from "@/src/features/search-bar/lib/langQ";
import { runSearchBarInvariants } from "@/src/features/search-bar/lib/searchBarInvariants";
import {
  createTopicTraceRegistry,
  filterTopicTraces,
  getTopicAssignment,
  selectTopicTraceFilters,
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
    expect(ids(filterTopicTraces(rows, filters, "REFUND POLICY"))).toEqual([
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

  it("searches summary, topic name and trace ID as a literal case-insensitive phrase", () => {
    expect(ids(filterTopicTraces(rows, [], "BILLING QUESTIONS"))).toEqual([
      "trace-one",
    ]);
    expect(ids(filterTopicTraces(rows, [], "TRACE-FOUR"))).toEqual([
      "trace-four",
    ]);
    expect(ids(filterTopicTraces(rows, [], "a*b"))).toEqual(["trace-one"]);
    expect(filterTopicTraces(rows, [], "refund%policy")).toEqual([]);
    expect(filterTopicTraces(rows, [], "questions refund")).toEqual([]);
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
});
