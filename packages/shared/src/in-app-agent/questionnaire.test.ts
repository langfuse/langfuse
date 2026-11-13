import { describe, expect, it } from "vitest";

import {
  InAppAgentQuestionnaireArgsSchema,
  resolveInAppAgentQuestionnaireAnswers,
} from "./questionnaire";

const args = {
  questions: [
    {
      question: "Which evaluator type?",
      options: [
        {
          label: "LLM-as-a-judge",
          description: "Model-graded",
          recommended: true,
        },
        { label: "Code", description: "Deterministic", recommended: false },
      ],
      allowMultiple: false,
    },
    {
      question: "Which scores?",
      options: [
        {
          label: "Helpfulness",
          description: "Answers the ask",
          recommended: false,
        },
        {
          label: "Toxicity",
          description: "Harmful content",
          recommended: false,
        },
      ],
      allowMultiple: true,
    },
    {
      question: "Run it on a schedule?",
      options: [
        { label: "Yes", description: "Daily run", recommended: false },
        { label: "No", description: "Manual only", recommended: false },
      ],
      allowMultiple: false,
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
          { selectedOptionIndexes: [1, 0], otherText: "Latency" },
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
            answer: ["Toxicity", "Helpfulness", "Latency"],
            skipped: false,
          },
          { question: "Run it on a schedule?", answer: [], skipped: true },
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

describe("InAppAgentQuestionnaireArgsSchema", () => {
  it("rejects a free-text question without options", () => {
    expect(
      InAppAgentQuestionnaireArgsSchema.safeParse({
        questions: [{ ...args.questions[0], options: [] }],
      }).success,
    ).toBe(false);
  });

  it("rejects more than one recommended option per question", () => {
    const [firstQuestion] = args.questions;
    const result = InAppAgentQuestionnaireArgsSchema.safeParse({
      questions: [
        {
          ...firstQuestion,
          options: firstQuestion.options.map((option) => ({
            ...option,
            recommended: true,
          })),
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(InAppAgentQuestionnaireArgsSchema.safeParse(args).success).toBe(
      true,
    );
  });

  it.each([
    { name: "a missing description", description: null },
    { name: "a blank description", description: "  " },
  ])("rejects an option with $name", ({ description }) => {
    const [firstQuestion] = args.questions;
    const result = InAppAgentQuestionnaireArgsSchema.safeParse({
      questions: [
        {
          ...firstQuestion,
          options: [
            { ...firstQuestion.options[0], description },
            firstQuestion.options[1],
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
