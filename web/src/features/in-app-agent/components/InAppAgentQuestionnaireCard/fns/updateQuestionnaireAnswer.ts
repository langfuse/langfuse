import type { InAppAgentQuestionnaireQuestion } from "@langfuse/shared/in-app-agent";
import { assertUnreachable } from "@/src/utils/types";
import type { QuestionnaireFormAnswer } from "./createQuestionnaireFormValues";

type QuestionnaireAnswerAction =
  | { type: "toggleOption"; optionIndex: number }
  | { type: "toggleOther" }
  | { type: "setOtherText"; otherText: string };

/**
 * Single-choice questions hold one answer at a time, so choosing an option
 * clears "Other" and typing a custom answer clears the chosen option.
 */
export function updateQuestionnaireAnswer(
  answer: QuestionnaireFormAnswer,
  question: InAppAgentQuestionnaireQuestion,
  action: QuestionnaireAnswerAction,
): QuestionnaireFormAnswer {
  if (action.type === "toggleOption") {
    return toggleOption(answer, question, action.optionIndex);
  }
  if (action.type === "toggleOther") {
    return toggleOther(answer, question);
  }
  if (action.type === "setOtherText") {
    return setOtherText(answer, question, action.otherText);
  }

  return assertUnreachable(action);
}

function toggleOption(
  answer: QuestionnaireFormAnswer,
  question: InAppAgentQuestionnaireQuestion,
  optionIndex: number,
): QuestionnaireFormAnswer {
  const isSelected = answer.selectedOptionIndexes.includes(optionIndex);

  if (!question.allowMultiple) {
    return {
      ...answer,
      selectedOptionIndexes: isSelected ? [] : [optionIndex],
      isOtherSelected: false,
    };
  }

  return {
    ...answer,
    selectedOptionIndexes: isSelected
      ? answer.selectedOptionIndexes.filter((index) => index !== optionIndex)
      : [...answer.selectedOptionIndexes, optionIndex],
  };
}

function toggleOther(
  answer: QuestionnaireFormAnswer,
  question: InAppAgentQuestionnaireQuestion,
): QuestionnaireFormAnswer {
  const isOtherSelected = !answer.isOtherSelected;

  return {
    ...answer,
    selectedOptionIndexes:
      isOtherSelected && !question.allowMultiple
        ? []
        : answer.selectedOptionIndexes,
    isOtherSelected,
  };
}

function setOtherText(
  answer: QuestionnaireFormAnswer,
  question: InAppAgentQuestionnaireQuestion,
  otherText: string,
): QuestionnaireFormAnswer {
  return {
    ...answer,
    selectedOptionIndexes: question.allowMultiple
      ? answer.selectedOptionIndexes
      : [],
    isOtherSelected: true,
    otherText,
  };
}
