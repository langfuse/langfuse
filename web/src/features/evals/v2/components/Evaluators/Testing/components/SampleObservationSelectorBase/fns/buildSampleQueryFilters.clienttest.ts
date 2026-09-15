import type { ColumnDefinition, FilterState } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import {
  buildSampleQueryFilters,
  removeInternalEvaluationEnvironmentColumnOptions,
  removeInternalEvaluationEnvironmentOptions,
} from "./buildSampleQueryFilters";

describe("buildSampleQueryFilters", () => {
  it("hides internal evaluation environments without changing visible filters", () => {
    const visibleFilters = [
      {
        column: "type",
        type: "stringOptions" as const,
        operator: "any of" as const,
        value: ["GENERATION"],
      },
    ] satisfies FilterState;

    const queryFilters = buildSampleQueryFilters(visibleFilters);

    expect(queryFilters).toEqual([
      ...visibleFilters,
      {
        column: "environment",
        type: "stringOptions",
        operator: "none of",
        value: expect.arrayContaining([
          "langfuse-llm-as-a-judge",
          "langfuse-code-eval",
          "langfuse-natural-language-filter",
          "langfuse-prompt-experiment",
          "langfuse-in-app-agent",
          "langfuse-evaluation",
          "llm-as-a-judge",
        ]),
      },
    ]);
    expect(visibleFilters).toHaveLength(1);
  });

  it("hides internal evaluation environments from builder columns", () => {
    const columns: ColumnDefinition[] = [
      {
        id: "environment",
        name: "Environment",
        type: "stringOptions",
        internal: "environment",
        options: [{ value: "langfuse-code-eval" }, { value: "production" }],
      },
    ];

    expect(removeInternalEvaluationEnvironmentColumnOptions(columns)).toEqual([
      {
        ...columns[0],
        options: [{ value: "production" }],
      },
    ]);
  });

  it("keeps valid experiment and user environment options visible", () => {
    expect(
      removeInternalEvaluationEnvironmentOptions({
        environment: [
          { value: "langfuse-code-eval" },
          { value: "llm-as-a-judge" },
          { value: "sdk-experiment" },
          { value: "my-langfuse-production" },
          { value: "production" },
        ],
      }),
    ).toEqual({
      environment: [
        { value: "sdk-experiment" },
        { value: "my-langfuse-production" },
        { value: "production" },
      ],
    });
  });
});
