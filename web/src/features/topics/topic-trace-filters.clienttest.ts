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
  topicTraceQuery,
  getTopicAssignment,
  pickedTopicFilters,
  pickedTopicId,
} from "./topic-trace-filters";
import { UNASSIGNED_TOPIC_ID } from "./prepare-topic-display";

const topics = [
  { id: "billing", name: "Billing questions" },
  { id: "support", name: "Support" },
];
const facet = { name: "Intent", topics };
const topicFilter = (
  operator: "any of" | "none of",
  value: string[],
  key = "Intent",
): FilterState[number] => ({
  column: "topics",
  type: "categoryOptions",
  key,
  operator,
  value,
});
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
  it("turns map and card selections into canonical filters and back", () => {
    const billing = pickedTopicFilters("Intent", "Billing questions");
    expect(billing).toEqual([topicFilter("any of", ["Billing questions"])]);
    expect(pickedTopicId(billing, facet)).toBe("billing");
    expect(pickedTopicId(billing, facet, "invoice")).toBeNull();
    expect(
      pickedTopicId([topicFilter("none of", ["Billing questions"])], facet),
    ).toBeNull();
    expect(
      pickedTopicId([topicFilter("any of", ["Missing"])], facet),
    ).toBeNull();
    expect(
      pickedTopicId(
        [topicFilter("any of", ["Billing questions"], "Sentiment")],
        facet,
      ),
    ).toBeNull();
    const unassigned = pickedTopicFilters("Intent", null);
    expect(unassigned).toEqual([
      {
        column: "assignment",
        type: "stringOptions",
        operator: "none of",
        value: ["assigned"],
      },
    ]);
    expect(pickedTopicId(unassigned, facet)).toBe(UNASSIGNED_TOPIC_ID);
  });

  it("combines fields with AND and values within a field with OR", () => {
    const filters: FilterState = [
      topicFilter("any of", ["Billing questions", "Support"]),
      {
        column: "assignment",
        type: "stringOptions",
        operator: "any of",
        value: ["assigned"],
      },
    ];
    expect(ids(filterTopicTraces(rows, filters, null, "Intent"))).toEqual([
      "trace-one",
      "trace-two",
    ]);
    expect(
      ids(filterTopicTraces(rows, filters, "trace-one", "Intent")),
    ).toEqual(["trace-one"]);
  });

  it("excludes selected topics while retaining rows without a topic", () => {
    expect(
      ids(
        filterTopicTraces(
          rows,
          [topicFilter("none of", ["Billing questions", "Support"])],
          null,
          "Intent",
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
          "Intent",
        ),
      ),
    ).toEqual(["trace-four", "trace-five", "trace-six"]);
  });

  it("searches topic names case-insensitively and trace IDs exactly, like the server", () => {
    expect(
      ids(filterTopicTraces(rows, [], "BILLING QUESTIONS", "Intent")),
    ).toEqual(["trace-one"]);
    expect(ids(filterTopicTraces(rows, [], "trace-four", "Intent"))).toEqual([
      "trace-four",
    ]);
    expect(filterTopicTraces(rows, [], "TRACE-FOUR", "Intent")).toEqual([]);
    expect(filterTopicTraces(rows, [], "refund policy", "Intent")).toEqual([]);
  });

  it("turns filters and search into the server query, or null when nothing can match", () => {
    const assignment = (operator: "any of" | "none of", value: string[]) => ({
      column: "assignment",
      type: "stringOptions" as const,
      operator,
      value,
    });
    expect(
      topicTraceQuery(
        [
          topicFilter("any of", ["Billing questions", "Support"]),
          assignment("any of", ["no_topic"]),
        ],
        "billing",
        facet,
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
      topicTraceQuery([], "trace-1", facet, { assignedOnly: true }),
    ).toEqual({ assigned: true, traceId: "trace-1" });
    expect(
      topicTraceQuery([topicFilter("any of", ["Unknown"])], null, facet),
    ).toBeNull();
    expect(
      topicTraceQuery(
        [
          assignment("any of", ["assigned"]),
          assignment("none of", ["assigned"]),
        ],
        null,
        facet,
      ),
    ).toBeNull();
  });

  it("handles empty results, cleared filters and empty positive selections", () => {
    expect(filterTopicTraces([], [], null, "Intent")).toEqual([]);
    expect(filterTopicTraces(rows, [], " ", "Intent")).toEqual(rows);
    expect(
      filterTopicTraces(rows, [topicFilter("any of", [])], null, "Intent"),
    ).toEqual([]);
    expect(
      filterTopicTraces(
        rows,
        [topicFilter("any of", ["missing"])],
        null,
        "Intent",
      ),
    ).toEqual([]);
  });
});

describe("topic search registry", () => {
  const registry = createTopicTraceRegistry("Intent");

  it("round-trips topics.<facet> filters and assignment labels", () => {
    const parsed = astToFilterState(
      parse(
        'topics.Intent:"Billing questions" assignment:"In a topic"',
        registry,
      ).ast,
      undefined,
      registry,
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.filters).toEqual([
      topicFilter("any of", ["Billing questions"]),
      {
        column: "assignment",
        type: "stringOptions",
        operator: "any of",
        value: ["assigned"],
      },
    ]);
    const roundTrip = filterStateToQueryText(parsed.filters, {}, registry);
    expect(roundTrip.skippedFilters).toEqual([]);
    expect(roundTrip.text).toContain('topics.Intent:"Billing questions"');
    expect(
      astToFilterState(parse(roundTrip.text, registry).ast, undefined, registry)
        .filters,
    ).toEqual(parsed.filters);
  });

  it("keeps status: on the assignment state when trace fields are added", () => {
    const traceRegistry = createTopicTraceRegistry("Intent", {
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

  it("keeps saved topic selections editable even when options disappear", () => {
    const filters: FilterState = [
      topicFilter("any of", ["Billing questions", "Retired topic"]),
    ];
    const query = filterStateToQueryText(filters, {}, registry);
    expect(query.skippedFilters).toEqual([]);
    const committed = planCommit(
      `${query.text} assignment:"In a topic" invoice`,
      undefined,
      registry,
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
  });

  it("rejects operators, other facets, and fields the local evaluator cannot apply", () => {
    for (const query of [
      "topics.Intent:>billing",
      "topics.Intent:*bill*",
      'topics.Sentiment:"Happy"',
      "summary:refund",
    ]) {
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
        extraKeys: ["topics.Intent"],
        scoreContexts: [{}],
        fieldValues: ["billing", "Support", '"Billing questions"', "outlier"],
        freeTextValues: ["refund policy", "or", "a*b", "trace-one"],
      }),
    ).toEqual([]);
  });
});
