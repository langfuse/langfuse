import { describe, expect, it } from "vitest";
import { getCreateEvaluatorHref } from "./utils";

describe("getCreateEvaluatorHref", () => {
  it("links forced-v3 projects to the legacy evaluator UI", () => {
    expect(
      getCreateEvaluatorHref({
        projectId: "project-id",
        forceV3Experience: true,
      }),
    ).toBe("/project/project-id/evals/legacy");
  });

  it("links other projects to the current evaluator gallery", () => {
    expect(
      getCreateEvaluatorHref({
        projectId: "project-id",
        forceV3Experience: false,
      }),
    ).toBe("/project/project-id/evals?gallery=open");
  });
});
