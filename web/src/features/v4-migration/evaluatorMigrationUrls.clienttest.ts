import { decodeFiltersGeneric } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import {
  buildDeprecatedEvaluatorsUrl,
  buildModernEvaluatorsUrl,
} from "./evaluatorMigrationUrls";

describe("buildDeprecatedEvaluatorsUrl", () => {
  it("shows actionable active and paused legacy evaluators", () => {
    const url = new URL(
      buildDeprecatedEvaluatorsUrl("project-1"),
      "https://langfuse.local",
    );

    expect(url.pathname).toBe("/project/project-1/evals/legacy");
    expect(decodeFiltersGeneric(url.searchParams.get("filter") ?? "")).toEqual([
      {
        column: "status",
        type: "stringOptions",
        operator: "any of",
        value: ["ACTIVE", "PAUSED"],
      },
      {
        column: "target",
        type: "stringOptions",
        operator: "any of",
        value: ["trace", "dataset"],
      },
      {
        column: "timeScope",
        type: "arrayOptions",
        operator: "any of",
        value: ["NEW"],
      },
    ]);
  });
});

describe("buildModernEvaluatorsUrl", () => {
  it("uses the default evaluator route", () => {
    expect(buildModernEvaluatorsUrl("project-1")).toBe(
      "/project/project-1/evals",
    );
  });
});
