"use client";

import {
  useId,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import { useForm } from "react-hook-form";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type {
  InAppAgentQuestionnaireAnswers,
  InAppAgentQuestionnaireQuestion,
} from "@langfuse/shared/in-app-agent";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { QuestionnaireStep } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/components/QuestionnaireStep/QuestionnaireStep";
import { createQuestionnaireFormValues } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/createQuestionnaireFormValues";
import { toQuestionnaireAnswers } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/toQuestionnaireAnswers";

export type InAppAgentQuestionnaireCardProps = {
  questions: readonly InAppAgentQuestionnaireQuestion[];
  isSubmitting: boolean;
  isDisabled?: boolean;
  onSubmit: (answers: InAppAgentQuestionnaireAnswers) => Promise<void>;
};

/**
 * Answers stay local until the final step, so the model receives every
 * answer in one approval decision. Dismissing submits every question as
 * skipped, so the model reads it as "no answer" rather than a declined call.
 */
export function InAppAgentQuestionnaireCard({
  questions,
  isSubmitting,
  isDisabled = false,
  onSubmit,
}: InAppAgentQuestionnaireCardProps) {
  const titleId = useId();
  const [stepIndex, setStepIndex] = useState(0);
  const [isDismissing, setIsDismissing] = useState(false);
  const form = useForm({
    defaultValues: createQuestionnaireFormValues(questions),
  });

  const question = questions[stepIndex];
  const stepCount = questions.length;
  const isLastStep = stepIndex === stepCount - 1;
  const isBusy =
    isSubmitting || isDismissing || form.formState.isSubmitting || isDisabled;

  const currentAnswer = form.watch(`answers.${stepIndex}`);
  const hasAnswer =
    currentAnswer.selectedOptionIndexes.length > 0 ||
    currentAnswer.otherText.trim().length > 0;

  const submitAnswers = form.handleSubmit(async (values) => {
    await onSubmit(toQuestionnaireAnswers(values));
  });

  const goToNextStep = () => {
    if (isBusy) {
      return;
    }
    if (isLastStep) {
      submitAnswers().catch(() => undefined);
      return;
    }
    setStepIndex(stepIndex + 1);
  };

  // Next and Submit confirm a choice; Skip advances without one.
  const confirmStep = () => {
    if (hasAnswer) {
      goToNextStep();
    }
  };

  const handleFormSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    confirmStep();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) {
      return;
    }
    event.preventDefault();
    confirmStep();
  };

  const handlePreviousStep = () => {
    setStepIndex(Math.max(stepIndex - 1, 0));
  };

  const handleNextStep = () => {
    setStepIndex(Math.min(stepIndex + 1, stepCount - 1));
  };

  const handleSkip = () => {
    form.resetField(`answers.${stepIndex}`);
    goToNextStep();
  };

  const handleDismiss = () => {
    setIsDismissing(true);
    // The provider surfaces decision errors; the card only resets its state.
    onSubmit(toQuestionnaireAnswers(createQuestionnaireFormValues(questions)))
      .catch(() => undefined)
      .finally(() => {
        setIsDismissing(false);
      });
  };

  const nextLabel = isLastStep ? "Submit" : "Next";
  return (
    <form
      aria-labelledby={titleId}
      className="bg-card text-foreground border-border overflow-hidden rounded-md border shadow-xs"
      onSubmit={handleFormSubmit}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-muted flex items-start gap-2 py-2 pr-2 pl-4">
        <h3
          id={titleId}
          className="min-w-0 flex-1 py-0.5 text-xs leading-5 font-bold"
        >
          {question.question}
        </h3>
        {stepCount > 1 ? (
          <div className="flex shrink-0 items-center">
            <IconButton
              icon={ChevronLeft}
              label="Previous question"
              size="sm"
              disabled={isBusy || stepIndex === 0}
              onClick={handlePreviousStep}
            />
            <span className="text-muted-foreground px-0.5 text-xs whitespace-nowrap tabular-nums">
              {stepIndex + 1} of {stepCount}
            </span>
            <IconButton
              icon={ChevronRight}
              label="Next question"
              size="sm"
              disabled={isBusy || isLastStep}
              onClick={handleNextStep}
            />
          </div>
        ) : null}
        <IconButton
          icon={X}
          label="Dismiss questions"
          size="sm"
          disabled={isBusy}
          onClick={handleDismiss}
        />
      </div>
      <QuestionnaireStep
        key={stepIndex}
        control={form.control}
        question={question}
        questionIndex={stepIndex}
        submitLabel={nextLabel}
        isDisabled={isBusy}
        onAdvance={goToNextStep}
        onSkip={handleSkip}
      />
    </form>
  );
}
