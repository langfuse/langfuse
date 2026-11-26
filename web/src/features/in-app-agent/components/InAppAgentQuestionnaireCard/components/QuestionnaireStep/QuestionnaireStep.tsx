"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { useController, type Control } from "react-hook-form";
import type { InAppAgentQuestionnaireQuestion } from "@langfuse/shared/in-app-agent";
import type { QuestionnaireFormValues } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/createQuestionnaireFormValues";
import { updateQuestionnaireAnswer } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/updateQuestionnaireAnswer";
import { SingleChoiceOptions } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/components/QuestionnaireStep/components/SingleChoiceOptions/SingleChoiceOptions";
import { MultipleChoiceOptions } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/components/QuestionnaireStep/components/MultipleChoiceOptions/MultipleChoiceOptions";
import { QuestionnaireStepFooter } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/components/QuestionnaireStep/components/QuestionnaireStepFooter/QuestionnaireStepFooter";

type QuestionnaireAnswerAction = Parameters<
  typeof updateQuestionnaireAnswer
>[2];

export type QuestionnaireStepProps = {
  control: Control<QuestionnaireFormValues>;
  question: InAppAgentQuestionnaireQuestion;
  questionIndex: number;
  submitLabel: string;
  isDisabled: boolean;
  /** Moves to the next step, or submits on the last one. */
  onAdvance: () => void;
  onSkip: () => void;
};

/**
 * Options and the custom answer form one divided list, picked with a radio or
 * a checkbox. Pressing an option's number picks it, and on a single-choice
 * question moves on. A typed answer turns Skip into Submit; multiple choice
 * confirms from the footer.
 */
export function QuestionnaireStep({
  control,
  question,
  questionIndex,
  submitLabel,
  isDisabled,
  onAdvance,
  onSkip,
}: QuestionnaireStepProps) {
  const otherInputRef = useRef<HTMLInputElement>(null);
  const { field } = useController({
    control,
    name: `answers.${questionIndex}`,
  });
  const answer = field.value;
  const hasOtherText = answer.otherText.trim().length > 0;
  const [isOtherOpen, setIsOtherOpen] = useState(hasOtherText);
  const selectedCount =
    answer.selectedOptionIndexes.length + (hasOtherText ? 1 : 0);

  const updateAnswer = (action: QuestionnaireAnswerAction) => {
    field.onChange(updateQuestionnaireAnswer(answer, question, action));
  };

  const openOther = () => {
    flushSync(() => {
      setIsOtherOpen(true);
    });
    otherInputRef.current?.focus();
  };

  const handleSelectOption = (optionIndex: number) => {
    updateAnswer({ type: "selectOption", optionIndex });
    setIsOtherOpen(false);
  };

  const handleToggleOption = (optionIndex: number) => {
    updateAnswer({ type: "toggleOption", optionIndex });
  };

  const handleSelectOther = () => {
    updateAnswer({ type: "selectOther" });
    openOther();
  };

  const handleToggleOther = () => {
    if (!isOtherOpen) {
      openOther();
      return;
    }
    updateAnswer({ type: "setOtherText", otherText: "" });
    setIsOtherOpen(false);
  };

  const handleOtherTextChange = (otherText: string) => {
    updateAnswer({ type: "setOtherText", otherText });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const isTyping = event.target instanceof HTMLInputElement;
    const hasModifier = event.metaKey || event.ctrlKey || event.altKey;
    const optionIndex = Number(event.key) - 1;
    if (
      isTyping ||
      hasModifier ||
      isDisabled ||
      !Number.isInteger(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= question.options.length
    ) {
      return;
    }
    event.preventDefault();
    if (question.allowMultiple) {
      handleToggleOption(optionIndex);
      return;
    }
    handleSelectOption(optionIndex);
    onAdvance();
  };

  return (
    <div onKeyDown={handleKeyDown}>
      {question.allowMultiple ? (
        <MultipleChoiceOptions
          question={question}
          answer={answer}
          isOtherOpen={isOtherOpen}
          isDisabled={isDisabled}
          otherInputRef={otherInputRef}
          onToggleOption={handleToggleOption}
          onToggleOther={handleToggleOther}
          onOtherTextChange={handleOtherTextChange}
        />
      ) : (
        <SingleChoiceOptions
          question={question}
          answer={answer}
          isOtherOpen={isOtherOpen}
          isDisabled={isDisabled}
          otherInputRef={otherInputRef}
          onSelectOption={handleSelectOption}
          onSelectOther={handleSelectOther}
          onOtherTextChange={handleOtherTextChange}
          onAdvance={onAdvance}
        />
      )}
      <QuestionnaireStepFooter
        actions={getFooterActions(question.allowMultiple, hasOtherText)}
        submitLabel={submitLabel}
        isDisabled={isDisabled}
        isSubmitDisabled={selectedCount === 0}
        onSkip={onSkip}
      />
    </div>
  );
}

// Single choice shows Skip until a custom answer is typed, then Submit.
function getFooterActions(allowMultiple: boolean, hasOtherText: boolean) {
  if (allowMultiple) {
    return "skipAndSubmit";
  }
  return hasOtherText ? "submit" : "skip";
}
