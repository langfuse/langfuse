import {
  decodeFiltersGeneric,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared";
import { describe, expect, it } from "vitest";
import { ruleExecutionsUrl } from "./ruleExecutionsUrl";

describe("ruleExecutionsUrl", () => {
  it("forwards to root executions in evaluator environments", () => {
    const url = new URL(
      ruleExecutionsUrl("project/id", "rule-1"),
      "https://langfuse.local",
    );

    expect(url.pathname).toBe("/project/project%2Fid/traces");
    expect(decodeFiltersGeneric(url.searchParams.get("filter") ?? "")).toEqual([
      {
        column: "ruleId",
        type: "stringOptions",
        operator: "any of",
        value: ["rule-1"],
      },
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: [
          LangfuseInternalTraceEnvironment.CodeEval,
          LangfuseInternalTraceEnvironment.LLMJudge,
        ],
      },
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ]);
  });
});
