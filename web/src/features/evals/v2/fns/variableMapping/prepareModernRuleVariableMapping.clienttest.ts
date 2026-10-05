import {
  CODE_EVAL_TEMPLATE_VARIABLES,
  EvalTemplateType,
} from "@langfuse/shared";
import { describe, expect, it } from "vitest";
import { coverEvaluatorPromptVariables } from "./coverEvaluatorPromptVariables";
import { prepareModernRuleVariableMapping } from "./prepareModernRuleVariableMapping";

describe("prepareModernRuleVariableMapping", () => {
  it("uses the canonical mapping for code evaluators", () => {
    const mapping = CODE_EVAL_TEMPLATE_VARIABLES.map((variable) => ({
      templateVariable: variable,
      selectedColumnId: variable,
      jsonSelector: null,
    }));

    expect(
      prepareModernRuleVariableMapping(null, EvalTemplateType.CODE),
    ).toEqual({
      defaultVariableMapping: mapping,
      initialVariableMapping: null,
    });
  });

  it.each([
    { langfuseObject: "trace" },
    { langfuseObject: "dataset_item", objectName: null },
  ])("clears legacy mapping fields before Zod can strip them", (legacy) => {
    const result = prepareModernRuleVariableMapping(
      [
        {
          templateVariable: "input",
          selectedColumnId: "input",
          jsonSelector: "nested.value",
          ...legacy,
        },
        {
          templateVariable: "output",
          selectedColumnId: "output",
          jsonSelector: null,
          ...legacy,
        },
      ],
      EvalTemplateType.LLM_AS_JUDGE,
    );

    expect(result).toEqual({
      defaultVariableMapping: [
        {
          templateVariable: "input",
          selectedColumnId: "",
          jsonSelector: null,
        },
        {
          templateVariable: "output",
          selectedColumnId: "",
          jsonSelector: null,
        },
      ],
      initialVariableMapping: [
        {
          templateVariable: "input",
          selectedColumnId: "",
          jsonSelector: null,
        },
        {
          templateVariable: "output",
          selectedColumnId: "",
          jsonSelector: null,
        },
      ],
    });
  });

  it("keeps a modern observation mapping inherited", () => {
    const mapping = [
      {
        templateVariable: "output",
        selectedColumnId: "output",
        jsonSelector: "value",
      },
    ];

    expect(
      prepareModernRuleVariableMapping(mapping, EvalTemplateType.LLM_AS_JUDGE),
    ).toEqual({
      defaultVariableMapping: mapping,
      initialVariableMapping: null,
    });
  });

  it("safely treats malformed non-legacy mappings as empty", () => {
    expect(
      prepareModernRuleVariableMapping(
        [{ templateVariable: "output" }],
        EvalTemplateType.LLM_AS_JUDGE,
      ),
    ).toEqual({
      defaultVariableMapping: [],
      initialVariableMapping: null,
    });
  });
});

describe("coverEvaluatorPromptVariables", () => {
  it("adds empty rows for prompt variables missing from the stored mapping", () => {
    expect(
      coverEvaluatorPromptVariables(
        [{ templateVariable: "output", selectedColumnId: "output" }],
        ["input", "output"],
      ),
    ).toEqual([
      { templateVariable: "output", selectedColumnId: "output" },
      { templateVariable: "input", selectedColumnId: "", jsonSelector: null },
    ]);
  });

  it("returns the original mapping when every prompt variable is already listed", () => {
    const mapping = [
      { templateVariable: "output", selectedColumnId: "output" },
    ];

    expect(coverEvaluatorPromptVariables(mapping, ["output"])).toBe(mapping);
  });
});
