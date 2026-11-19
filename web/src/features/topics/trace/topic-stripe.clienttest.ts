// @vitest-environment node

import type { FilterState } from "@langfuse/shared";
import { describe, expect, it } from "vitest";
import {
  TOPIC_STRIPE_SLOTS,
  toggleStripeTopic,
  topicStripeSegments,
} from "./topic-stripe";

describe("topicStripeSegments", () => {
  it("counts distinct traces per topic, unassigned last", () => {
    const segments = topicStripeSegments({
      // Two observations of trace one count once.
      rows: [
        { traceId: "one" },
        { traceId: "one" },
        { traceId: "two" },
        { traceId: "three" },
        { traceId: null },
      ],
      topicsByTrace: {
        one: [
          { facet: "Intent", topic: "Billing" },
          { facet: "Intent", topic: "Billing" },
          { facet: "Tone", topic: "Angry" },
        ],
        two: [{ facet: "Intent", topic: "Refunds" }],
        three: [{ facet: "Tone", topic: "Calm" }],
      },
      facet: "Intent",
      facetTopics: ["Refunds", "Billing"],
    });
    expect(segments).toEqual([
      { kind: "topic", name: "Billing", count: 1, slot: 1 },
      { kind: "topic", name: "Refunds", count: 1, slot: 0 },
      { kind: "unassigned", count: 1 },
    ]);
  });

  it("folds topics past the slot limit into one segment", () => {
    const names = Array.from(
      { length: TOPIC_STRIPE_SLOTS + 3 },
      (_, i) => `Topic ${String(i).padStart(2, "0")}`,
    );
    const segments = topicStripeSegments({
      rows: names.map((name) => ({ traceId: name })),
      topicsByTrace: Object.fromEntries(
        names.map((name) => [name, [{ facet: "Intent", topic: name }]]),
      ),
      facet: "Intent",
      facetTopics: names,
    });
    expect(segments).toHaveLength(TOPIC_STRIPE_SLOTS + 1);
    expect(segments.at(-1)).toEqual({ kind: "more", count: 3, topicCount: 3 });
  });
});

describe("toggleStripeTopic", () => {
  const other: FilterState = [
    {
      type: "categoryOptions",
      column: "topics",
      key: "Intent",
      operator: "none of",
      value: ["Spam"],
    },
    { type: "string", column: "name", operator: "=", value: "chat" },
  ];

  it("adds to and removes from the facet's any-of filter, keeping other filters", () => {
    const added = toggleStripeTopic(other, "Intent", "Billing");
    const both = toggleStripeTopic(added, "Intent", "Refunds");
    expect(both).toEqual([
      ...other,
      {
        type: "categoryOptions",
        column: "topics",
        key: "Intent",
        operator: "any of",
        value: ["Billing", "Refunds"],
      },
    ]);
    const removed = toggleStripeTopic(
      toggleStripeTopic(both, "Intent", "Billing"),
      "Intent",
      "Refunds",
    );
    expect(removed).toEqual(other);
  });

  it("edits only the first any-of filter of the facet", () => {
    const second: FilterState[number] = {
      type: "categoryOptions",
      column: "topics",
      key: "Intent",
      operator: "any of",
      value: ["Refunds"],
    };
    const filters: FilterState = [
      ...other,
      {
        type: "categoryOptions",
        column: "topics",
        key: "Intent",
        operator: "any of",
        value: ["Billing"],
      },
      second,
    ];
    expect(toggleStripeTopic(filters, "Intent", "Billing")).toEqual([
      ...other,
      second,
    ]);
  });
});
