import { describe, expect, it } from "vitest";
import type { Observation } from "@langfuse/shared";
import { matchTopicRules } from "./ruleMatching";
import { getDeterministicSamplingValue } from "../evaluation/deterministicSampling";

const observation = (overrides: Partial<Observation>) =>
  ({
    id: "span",
    traceId: "trace",
    parentObservationId: null,
    name: "support-agent",
    type: "SPAN",
    level: "DEFAULT",
    environment: "production",
    metadata: {},
    ...overrides,
  }) as Observation;

const rule = (
  id: string,
  filter: unknown[],
  overrides: { sampling?: number; enabled?: boolean } = {},
) =>
  ({
    id,
    filter,
    sampling: overrides.sampling ?? 1,
    enabled: overrides.enabled ?? true,
  }) as Parameters<typeof matchTopicRules>[2][number];

const environment = (value: string) => ({
  column: "environment",
  type: "stringOptions",
  operator: "any of",
  value: [value],
});
const traceName = (value: string) => ({
  column: "traceName",
  type: "string",
  operator: "=",
  value,
});

describe("matchTopicRules", () => {
  const trace = [
    observation({}),
    observation({
      id: "child",
      parentObservationId: "span",
      name: "llm-call",
      type: "GENERATION",
      level: "ERROR",
    }),
  ];

  it("matches every overlapping rule whose filters one observation meets", () => {
    expect(
      matchTopicRules("trace", trace, [
        rule("all", []),
        rule("support-prod", [
          environment("production"),
          traceName("support-agent"),
        ]),
        rule("checkout", [traceName("checkout-agent")]),
        rule("errors", [
          {
            column: "level",
            type: "stringOptions",
            operator: "any of",
            value: ["ERROR"],
          },
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["GENERATION"],
          },
        ]),
      ]),
    ).toEqual(["all", "support-prod", "errors"]);
  });

  it("requires one observation to meet all filters of a rule", () => {
    expect(
      matchTopicRules("trace", trace, [
        rule("split", [
          {
            column: "level",
            type: "stringOptions",
            operator: "any of",
            value: ["ERROR"],
          },
          {
            column: "name",
            type: "string",
            operator: "=",
            value: "support-agent",
          },
        ]),
      ]),
    ).toEqual([]);
  });

  it("applies each rule's deterministic sampling and skips disabled rules", () => {
    const value = getDeterministicSamplingValue("trace");
    expect(
      matchTopicRules("trace", trace, [
        rule("above", [], { sampling: Math.min(1, value + 0.01) }),
        rule("below", [], { sampling: Math.max(0, value - 0.01) }),
        rule("off", [], { enabled: false }),
      ]),
    ).toEqual(["above"]);
  });
});
