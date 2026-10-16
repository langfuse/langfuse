import { describe, expect, it } from "vitest";

import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import type { RouterOutputs } from "@/src/utils/api";
import { evaluatorToEvaluatorSetupDraft } from "./evaluatorToEvaluatorSetupDraft";

const questions = [
  {
    id: "q1",
    type: "choice" as const,
    scoreName: "verdict",
    instructions: "Is the response ready?",
    options: [{ value: "ready" }, { value: "not_ready" }],
  },
];

const variableMapping = [
  {
    templateVariable: "input",
    selectedColumnId: "input",
    jsonSelector: null,
  },
  {
    templateVariable: "output",
    selectedColumnId: "output",
    jsonSelector: null,
  },
];

function galleryEvaluator(
  overrides: Partial<RouterOutputs["evalsV2"]["get"]> &
    Pick<RouterOutputs["evalsV2"]["get"], "type">,
  version: Partial<RouterOutputs["evalsV2"]["get"]["versions"][number]>,
): RouterOutputs["evalsV2"]["get"] {
  return {
    name: "Custom evaluator",
    description: null,
    versions: [version],
    ...overrides,
  } as RouterOutputs["evalsV2"]["get"];
}

describe("evaluatorToEvaluatorSetupDraft", () => {
  it("keeps decision-model questions and vars when cloning from the gallery", () => {
    const draft = evaluatorToEvaluatorSetupDraft(
      galleryEvaluator(
        { type: "DECISION_MODEL", name: "JEV evaluator" },
        {
          questions,
          provider: "typesafe",
          model: "jev-latest",
          vars: ["input", "output"],
          variableMapping,
          sourceCode: null,
          sourceCodeLanguage: null,
        },
      ),
    );

    expect(draft).toMatchObject({
      name: "JEV evaluator",
      definition: {
        type: "DECISION_MODEL",
        questions,
        provider: "typesafe",
        model: "jev-latest",
        vars: ["input", "output"],
        variableMapping,
      },
    });

    expect(() =>
      createEvaluatorSetupStore({
        initialEvaluator: draft,
        mode: "create",
      }),
    ).not.toThrow();
    expect(
      createEvaluatorSetupStore({
        initialEvaluator: draft,
        mode: "create",
      }).getState().variableFields,
    ).toEqual({
      input: { selectedColumnId: "input", jsonSelector: null },
      output: { selectedColumnId: "output", jsonSelector: null },
    });
  });

  it("prefills an LLM evaluator clone", () => {
    const draft = evaluatorToEvaluatorSetupDraft(
      galleryEvaluator(
        { type: "LLM_AS_JUDGE", name: "Answer quality" },
        {
          promptMessages: [{ role: "user", content: "Judge {{output}}" }],
          provider: "openai",
          model: "gpt-4.1-mini",
          modelParams: { temperature: 0.2 },
          vars: ["output"],
          variableMapping: [
            {
              templateVariable: "output",
              selectedColumnId: "output",
              jsonSelector: null,
            },
          ],
          outputDefinition: {
            dataType: "NUMERIC",
            score: {
              description: "Answer quality",
              minValue: 0,
              maxValue: 1,
            },
            reasoning: { description: "Explain the score" },
          },
        },
      ),
    );

    expect(draft).toMatchObject({
      name: "Answer quality",
      definition: {
        type: "LLM_AS_JUDGE",
        vars: ["output"],
        provider: "openai",
        model: "gpt-4.1-mini",
      },
    });
  });

  it("prefills a code evaluator clone", () => {
    const draft = evaluatorToEvaluatorSetupDraft(
      galleryEvaluator(
        { type: "CODE", name: "Has output" },
        {
          sourceCode: "return { score: 1 };",
          sourceCodeLanguage: "TYPESCRIPT",
        },
      ),
    );

    expect(draft).toMatchObject({
      name: "Has output",
      definition: {
        type: "CODE",
        sourceCode: "return { score: 1 };",
        sourceCodeLanguage: "TYPESCRIPT",
      },
    });
  });
});
