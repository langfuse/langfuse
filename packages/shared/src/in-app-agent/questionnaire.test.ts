import { describe, expect, it } from "vitest";

import { resolveInAppAgentQuestionnaireAnswers } from "./questionnaire";

const args = {
  questions: [
    {
      question: "Which evaluator type?",
      options: [
        { label: "LLM-as-a-judge", description: null, recommended: true },
        { label: "Code", description: "Deterministic", recommended: false },
      ],
      allowMultiple: false,
      allowOther: true,
    },
    {
      question: "Which scores?",
      options: [
        { label: "Helpfulness", description: null, recommended: false },
        { label: "Toxicity", description: null, recommended: false },
      ],
      allowMultiple: true,
      allowOther: false,
    },
    {
      question: "Anything else?",
      options: [],
      allowMultiple: false,
      allowOther: false,
    },
  ],
};

describe("resolveInAppAgentQuestionnaireAnswers", () => {
  it("resolves selected options, custom text, and skipped questions", () => {
    expect(
      resolveInAppAgentQuestionnaireAnswers({
        args,
        answers: [
          { selectedOptionIndexes: [], otherText: "  Human review " },
          { selectedOptionIndexes: [1, 0], otherText: null },
          { selectedOptionIndexes: [], otherText: "  " },
        ],
      }),
    ).toEqual({
      success: true,
      result: {
        type: "questionnaireAnswers",
        answers: [
          {
            question: "Which evaluator type?",
            answer: ["Human review"],
            skipped: false,
          },
          {
            question: "Which scores?",
            answer: ["Toxicity", "Helpfulness"],
            skipped: false,
          },
          { question: "Anything else?", answer: [], skipped: true },
        ],
      },
    });
  });

  it.each([
    {
      name: "missing answer entries",
      answers: [{ selectedOptionIndexes: [0], otherText: null }],
    },
    {
      name: "out-of-range option",
      answers: [
        { selectedOptionIndexes: [2], otherText: null },
        { selectedOptionIndexes: [], otherText: null },
        { selectedOptionIndexes: [], otherText: null },
      ],
    },
    {
      name: "multiple answers on a single-choice question",
      answers: [
        { selectedOptionIndexes: [0], otherText: "Other" },
        { selectedOptionIndexes: [], otherText: null },
        { selectedOptionIndexes: [], otherText: null },
      ],
    },
    {
      name: "custom text where it is not allowed",
      answers: [
        { selectedOptionIndexes: [], otherText: null },
        { selectedOptionIndexes: [0], otherText: "Latency" },
        { selectedOptionIndexes: [], otherText: null },
      ],
    },
    {
      name: "duplicate selections",
      answers: [
        { selectedOptionIndexes: [], otherText: null },
        { selectedOptionIndexes: [0, 0], otherText: null },
        { selectedOptionIndexes: [], otherText: null },
      ],
    },
  ])("rejects $name", ({ answers }) => {
    expect(
      resolveInAppAgentQuestionnaireAnswers({ args, answers }).success,
    ).toBe(false);
  });
});
