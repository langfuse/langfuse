"use client";

import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import { useForm, useWatch } from "react-hook-form";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type {
  InAppAgentQuestionnaireAnswers,
  InAppAgentQuestionnaireQuestion,
} from "@langfuse/shared/in-app-agent";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { InAppAgentToolCallCard } from "@/src/features/in-app-agent/components/InAppAgentToolCallCard";
import type { InAppAgentToolCallContent } from "@/src/features/in-app-agent/components/utils/utils";
import { QuestionnaireStep } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/components/QuestionnaireStep/QuestionnaireStep";
import { parseQuestionnaireQuestions } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/parseQuestionnaireQuestions";
import { createQuestionnaireFormValues } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/createQuestionnaireFormValues";
import { toQuestionnaireAnswers } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/toQuestionnaireAnswers";

export type InAppAgentQuestionnaireCardProps = {
  tool: InAppAgentToolCallContent;
  isDisabled?: boolean;
  onAnswerQuestionnaire: (
    approvalId: string,
    answers: InAppAgentQuestionnaireAnswers,
  ) => Promise<void>;
  onRejectToolCall: (approvalId: string) => Promise<void>;
};

export function InAppAgentQuestionnaireCard({
  tool,
  isDisabled = false,
  onAnswerQuestionnaire,
  onRejectToolCall,
}: InAppAgentQuestionnaireCardProps) {
  const questions = useMemo(
    () => parseQuestionnaireQuestions(tool.args),
    [tool.args],
  );

  // Malformed questions can still be declined through the generic card.
  if (!tool.approval || !questions) {
    return (
      <InAppAgentToolCallCard
        tool={tool}
        isCompact
        isDisabled={isDisabled}
        onRejectToolCall={onRejectToolCall}
      />
    );
  }

  return (
    <QuestionnaireForm
      approvalId={tool.approval.id}
      questions={questions}
      isSubmitting={tool.approval.status === "submitting"}
      isDisabled={isDisabled}
      onSubmit={onAnswerQuestionnaire}
    />
  );
}

type QuestionnaireFormProps = {
  approvalId: string;
  questions: readonly InAppAgentQuestionnaireQuestion[];
  isSubmitting: boolean;
  isDisabled: boolean;
  onSubmit: InAppAgentQuestionnaireCardProps["onAnswerQuestionnaire"];
};

/**
 * Answers stay local until the final step, so the model receives every
 * answer in one approval decision. Dismissing submits every question as
 * skipped, so the model reads it as "no answer" rather than a declined call.
 */
function QuestionnaireForm({
  approvalId,
  questions,
  isSubmitting,
  isDisabled,
  onSubmit,
}: QuestionnaireFormProps) {
  const titleId = useId();
  const [stepIndex, setStepIndex] = useState(0);
  const [isDismissing, setIsDismissing] = useState(false);
  const form = useForm({
    defaultValues: createQuestionnaireFormValues(questions),
  });

  const otherText = useWatch({
    control: form.control,
    name: `answers.${stepIndex}.otherText`,
  });

  const question = questions[stepIndex];
  const stepCount = questions.length;
  const isLastStep = stepIndex === stepCount - 1;
  const isBusy =
    isSubmitting || isDismissing || form.formState.isSubmitting || isDisabled;

  const submitAnswers = form.handleSubmit(async (values) => {
    await onSubmit(approvalId, toQuestionnaireAnswers(values));
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

  const handleFormSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    goToNextStep();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) {
      return;
    }
    event.preventDefault();
    goToNextStep();
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
    onSubmit(
      approvalId,
      toQuestionnaireAnswers(createQuestionnaireFormValues(questions)),
    )
      .catch(() => undefined)
      .finally(() => {
        setIsDismissing(false);
      });
  };

  const nextLabel = isLastStep ? "Submit" : "Next";
  // A typed answer brings its own submit button next to the input.
  const nextButton =
    otherText.trim().length > 0 ? null : (
      <Button
        text={nextLabel}
        size="sm"
        disabled={isDisabled}
        loading={isSubmitting || form.formState.isSubmitting}
        onClick={goToNextStep}
      />
    );

  return (
    <form
      aria-labelledby={titleId}
      className="bg-card text-foreground border-border rounded-xl border shadow-xs"
      onSubmit={handleFormSubmit}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        <h3 id={titleId} className="min-w-0 flex-1 text-sm leading-5 font-bold">
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
        onSkip={handleSkip}
      />
      {nextButton ? (
        <div className="flex justify-end px-3 pb-3">{nextButton}</div>
      ) : null}
    </form>
  );
}
