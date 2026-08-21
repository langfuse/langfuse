import { describe, expect, it } from "vitest";
import { prepareModernRuleVariableMapping } from "./prepareModernRuleVariableMapping";

describe("prepareModernRuleVariableMapping", () => {
  it.each([
    { langfuseObject: "trace" },
    { langfuseObject: "dataset_item", objectName: null },
  ])("clears legacy mapping fields before Zod can strip them", (legacy) => {
    const result = prepareModernRuleVariableMapping([
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
    ]);

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

    expect(prepareModernRuleVariableMapping(mapping)).toEqual({
      defaultVariableMapping: mapping,
      initialVariableMapping: null,
    });
  });

  it("safely treats malformed non-legacy mappings as empty", () => {
    expect(
      prepareModernRuleVariableMapping([{ templateVariable: "output" }]),
    ).toEqual({
      defaultVariableMapping: [],
      initialVariableMapping: null,
    });
  });
});
