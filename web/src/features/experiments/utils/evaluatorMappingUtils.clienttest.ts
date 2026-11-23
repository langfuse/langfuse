import { describe, expect, it } from "vitest";
import {
  EvalTargetObject,
  type EvalTemplate,
  evalVariableMappingListSchema,
} from "@langfuse/shared";
import { createDefaultVariableMappings } from "@/src/features/experiments/utils/evaluatorMappingUtils";

describe("createDefaultVariableMappings", () => {
  it("maps template variables to experiment columns and leaves unknown ones unmapped", () => {
    const mappings = createDefaultVariableMappings({
      vars: ["query", "answer", "ground_truth", "rubric"],
    } as EvalTemplate);

    expect(
      evalVariableMappingListSchema(EvalTargetObject.EXPERIMENT).parse(
        mappings,
      ),
    ).toEqual([
      { templateVariable: "query", selectedColumnId: "input" },
      { templateVariable: "answer", selectedColumnId: "output" },
      {
        templateVariable: "ground_truth",
        selectedColumnId: "experimentItemExpectedOutput",
      },
      { templateVariable: "rubric", selectedColumnId: "" },
    ]);
  });
});
