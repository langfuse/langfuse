import type { InAppAgentQuestionnaireQuestion } from "@langfuse/shared/in-app-agent";
import { assertUnreachable } from "@/src/utils/types";
import type { QuestionnaireFormAnswer } from "./createQuestionnaireFormValues";

type QuestionnaireAnswerAction =
  | { type: "selectOption"; optionIndex: number }
  | { type: "toggleOption"; optionIndex: number }
  | { type: "selectOther" }
  | { type: "setOtherText"; otherText: string };

/**
 * Single-choice questions hold one answer at a time, so choosing an option
 * clears the custom answer, and choosing or typing a custom answer clears the
 * chosen option.
 * Multi-choice questions keep every toggled option next to the custom answer.
 */
export function updateQuestionnaireAnswer(
  answer: QuestionnaireFormAnswer,
  question: InAppAgentQuestionnaireQuestion,
  action: QuestionnaireAnswerAction,
): QuestionnaireFormAnswer {
  if (action.type === "selectOption") {
    return { selectedOptionIndexes: [action.optionIndex], otherText: "" };
  }
  if (action.type === "toggleOption") {
    return toggleOption(answer, action.optionIndex);
  }
  if (action.type === "selectOther") {
    return question.allowMultiple
      ? answer
      : { selectedOptionIndexes: [], otherText: answer.otherText };
  }
  if (action.type === "setOtherText") {
    return setOtherText(answer, question, action.otherText);
  }

  return assertUnreachable(action);
}

function toggleOption(
  answer: QuestionnaireFormAnswer,
  optionIndex: number,
): QuestionnaireFormAnswer {
  const isSelected = answer.selectedOptionIndexes.includes(optionIndex);

  return {
    ...answer,
    selectedOptionIndexes: isSelected
      ? answer.selectedOptionIndexes.filter((index) => index !== optionIndex)
      : [...answer.selectedOptionIndexes, optionIndex],
  };
}

function setOtherText(
  answer: QuestionnaireFormAnswer,
  question: InAppAgentQuestionnaireQuestion,
  otherText: string,
): QuestionnaireFormAnswer {
  const clearsSelection =
    !question.allowMultiple && otherText.trim().length > 0;

  return {
    selectedOptionIndexes: clearsSelection ? [] : answer.selectedOptionIndexes,
    otherText,
  };
}
