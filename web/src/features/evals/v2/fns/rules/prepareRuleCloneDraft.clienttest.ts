import { describe, expect, it } from "vitest";
import type { RuleTableRow } from "@/src/features/evals/v2/types/rules";
import { prepareRuleCloneDraft } from "./prepareRuleCloneDraft";

describe("prepareRuleCloneDraft", () => {
  it("copies the rule configuration and evaluator mappings into a new draft", () => {
    const rule = {
      name: "Production quality",
      filter: [
        {
          column: "name",
          type: "string",
          operator: "=",
          value: "generation",
        },
      ],
      sampling: 0.25,
      assignments: [
        {
          evaluator: {
            id: "evaluator-1",
            name: "Correctness",
            type: "LLM_AS_JUDGE",
            latestVersion: {
              variableMapping: [
                {
                  templateVariable: "input",
                  selectedColumnId: "input",
                  jsonSelector: null,
                },
              ],
            },
          },
          variableMapping: [
            {
              templateVariable: "input",
              selectedColumnId: "metadata",
              jsonSelector: "$.question",
            },
          ],
        },
      ],
    } as RuleTableRow;

    expect(prepareRuleCloneDraft(rule)).toEqual({
      name: "Production quality copy",
      filter: rule.filter,
      sampling: 0.25,
      assignments: [
        {
          evaluatorId: "evaluator-1",
          evaluatorName: "Correctness",
          evaluatorType: "LLM_AS_JUDGE",
          defaultVariableMapping: [
            {
              templateVariable: "input",
              selectedColumnId: "input",
              jsonSelector: null,
            },
          ],
          variableMapping: [
            {
              templateVariable: "input",
              selectedColumnId: "metadata",
              jsonSelector: "$.question",
            },
          ],
        },
      ],
    });
  });
});
