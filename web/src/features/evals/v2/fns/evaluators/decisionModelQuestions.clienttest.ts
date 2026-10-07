import { DecisionModelQuestionType } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { previewOpenAIDecisionQuestions } from "./decisionModelQuestions";
import type { DecisionModelQuestionDraft } from "@/src/features/evals/v2/types/decisionModel";

const draft = (
  overrides: Partial<DecisionModelQuestionDraft> &
    Pick<DecisionModelQuestionDraft, "id" | "type">,
): DecisionModelQuestionDraft => ({
  scoreName: "",
  instructions: "",
  options: [
    { value: "", description: "" },
    { value: "", description: "" },
  ],
  levels: [{ description: "" }, { description: "" }],
  criteria: { true: "", false: "" },
  ...overrides,
});

describe("previewOpenAIDecisionQuestions", () => {
  it("shows choices, labeled levels, and folded yes/no criteria", () => {
    expect(
      previewOpenAIDecisionQuestions([
        draft({
          id: "department",
          type: DecisionModelQuestionType.CHOICE,
          instructions: " Which team? ",
          options: [
            { value: "billing", description: " Payments " },
            { value: "other", description: "  " },
          ],
        }),
        draft({
          id: "severity",
          type: DecisionModelQuestionType.SCORE,
          instructions: "How severe?",
          levels: [
            { label: "Cosmetic", description: "Appearance only" },
            { label: "Blocked", description: "" },
          ],
        }),
        draft({
          id: "refund",
          type: DecisionModelQuestionType.NOUL,
          instructions: "Does it request a refund?",
          criteria: { true: "Asks for money back", false: "" },
        }),
      ]),
    ).toEqual([
      {
        type: "choice",
        name: "department",
        instructions: "Which team?",
        choices: [
          { value: "billing", description: "Payments" },
          { value: "other" },
        ],
      },
      {
        type: "score",
        name: "severity",
        instructions: "How severe?",
        levels: [
          { label: "Cosmetic", description: "Appearance only" },
          { label: "Blocked" },
        ],
      },
      {
        type: "predicate",
        name: "refund",
        instructions:
          "Does it request a refund?\n\nCriteria for true:\nAsks for money back",
      },
    ]);
  });
});
