import { EvalTargetObject } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { getDatasetExperimentRules } from "./useExperimentV2EvaluatorSelection";

const experimentRootFilter = {
  column: "isExperimentItemRootSpan",
  type: "boolean",
  operator: "=",
  value: true,
} as const;

describe("getDatasetExperimentRules", () => {
  it("only returns the rule scoped to the selected dataset", () => {
    const datasetRule = {
      id: "dataset-rule",
      targetObject: EvalTargetObject.EVENT,
      filter: [
        experimentRootFilter,
        {
          column: "experimentDatasetId",
          type: "stringOptions",
          operator: "any of",
          value: ["dataset-1"],
        },
      ],
    };
    const otherDatasetRule = {
      ...datasetRule,
      id: "other-dataset-rule",
      filter: [
        experimentRootFilter,
        {
          column: "experimentDatasetId",
          type: "stringOptions",
          operator: "any of",
          value: ["dataset-2"],
        },
      ],
    };
    const globalExperimentRule = {
      ...datasetRule,
      id: "global-rule",
      filter: [experimentRootFilter],
    };

    const result = getDatasetExperimentRules(
      [datasetRule, otherDatasetRule, globalExperimentRule] as never,
      "dataset-1",
    );

    expect(result.map((rule) => rule.id)).toEqual(["dataset-rule"]);
  });
});
