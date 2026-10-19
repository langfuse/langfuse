// @vitest-environment node

import { decodeFiltersGeneric } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import {
  buildDeprecatedEvaluatorsUrl,
  buildDeprecatedRulesUrl,
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

describe("buildDeprecatedRulesUrl", () => {
  it("shows only rules that require an upgrade", () => {
    const url = new URL(
      buildDeprecatedRulesUrl("project-1"),
      "https://langfuse.local",
    );

    expect(url.pathname).toBe("/project/project-1/evals/rules");
    expect(decodeFiltersGeneric(url.searchParams.get("filter") ?? "")).toEqual([
      {
        column: "upgradeRequired",
        type: "boolean",
        operator: "=",
        value: true,
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
