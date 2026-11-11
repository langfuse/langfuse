import { describe, expect, it } from "vitest";
import type { FilterState } from "@langfuse/shared";

import {
  filtersFromSpan,
  observationTreeHints,
  spanMatchesFilters,
  type SpanProperties,
} from "./spanSampleFilters";

function span(
  overrides: Partial<SpanProperties> & { id: string },
): SpanProperties {
  return {
    name: "span",
    type: "SPAN",
    environment: "production",
    parentObservationId: "parent",
    ...overrides,
  };
}

const nameAndEnvironment = [
  {
    column: "name",
    type: "string",
    operator: "contains",
    value: "order",
  },
  {
    column: "environment",
    type: "stringOptions",
    operator: "any of",
    value: ["production"],
  },
  {
    column: "metadata",
    type: "stringObject",
    key: "customer",
    operator: "contains",
    value: "acme",
  },
] satisfies FilterState;

describe("span sample filters", () => {
  it("rewrites filters from the chosen span and classifies the tree", () => {
    const getOrder = span({
      id: "get-order",
      name: "get_order",
      type: "TOOL",
      metadata: { customer: "acme" },
    });
    const draft = span({
      id: "draft",
      name: "draft-reply",
      type: "GENERATION",
    });
    const sendReceipt = span({
      id: "send-receipt",
      name: "send-receipt",
      type: "SPAN",
      environment: "staging",
    });

    const oneMatch = observationTreeHints(
      [getOrder, draft, sendReceipt],
      nameAndEnvironment,
      "get-order",
    );
    expect(spanMatchesFilters(getOrder, nameAndEnvironment)).toBe(true);
    expect(oneMatch.get("get-order")).toBe("tested");
    expect(oneMatch.get("draft")).toBe("skipped");
    expect(oneMatch.get("send-receipt")).toBe("skipped");
    expect([...oneMatch.values()]).not.toContain("also");

    const many = observationTreeHints(
      [getOrder, draft, sendReceipt],
      [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
      ],
      "get-order",
    );
    expect(many.get("get-order")).toBe("tested");
    expect(many.get("draft")).toBe("also");
    expect(many.get("send-receipt")).toBe("skipped");

    const rewritten = filtersFromSpan(nameAndEnvironment, sendReceipt);
    expect(rewritten).toEqual([
      {
        column: "name",
        type: "string",
        operator: "contains",
        value: "send-receipt",
      },
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["staging"],
      },
    ]);
    expect(spanMatchesFilters(sendReceipt, rewritten)).toBe(true);
    expect(spanMatchesFilters(getOrder, rewritten)).toBe(false);

    const excluded = filtersFromSpan(
      [
        {
          column: "name",
          type: "string",
          operator: "does not contain",
          value: "order",
        },
      ],
      sendReceipt,
    );
    expect(excluded).toEqual([
      {
        column: "name",
        type: "string",
        operator: "=",
        value: "send-receipt",
      },
    ]);
    expect(spanMatchesFilters(sendReceipt, excluded)).toBe(true);
  });
});
