"use client";

import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import { useForm } from "react-hook-form";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type {
  InAppAgentQuestionnaireAnswers,
  InAppAgentQuestionnaireQuestion,
} from "@langfuse/shared/in-app-agent";
import { Badge } from "@/src/components/design-system/Badge/Badge";
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
      onDismiss={onRejectToolCall}
    />
  );
}

type QuestionnaireFormProps = {
  approvalId: string;
  questions: readonly InAppAgentQuestionnaireQuestion[];
  isSubmitting: boolean;
  isDisabled: boolean;
  onSubmit: InAppAgentQuestionnaireCardProps["onAnswerQuestionnaire"];
  onDismiss: InAppAgentQuestionnaireCardProps["onRejectToolCall"];
};

/**
 * Answers stay local until the final step, so the model receives every
 * answer in one approval decision.
 */
function QuestionnaireForm({
  approvalId,
  questions,
  isSubmitting,
  isDisabled,
  onSubmit,
  onDismiss,
}: QuestionnaireFormProps) {
  const titleId = useId();
  const [stepIndex, setStepIndex] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const form = useForm({
    defaultValues: createQuestionnaireFormValues(questions),
  });

  const question = questions[stepIndex];
  const stepCount = questions.length;
  const isLastStep = stepIndex === stepCount - 1;
  const isBusy =
    isSubmitting || isDismissing || form.formState.isSubmitting || isDisabled;

  const submitAnswers = form.handleSubmit(async (values) => {
    await onSubmit(approvalId, toQuestionnaireAnswers(values, questions));
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

  const handleBack = () => {
    setStepIndex(Math.max(stepIndex - 1, 0));
  };

  const handleSkip = () => {
    form.resetField(`answers.${stepIndex}`);
    goToNextStep();
  };

  const handleToggleCollapsed = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleDismiss = () => {
    setIsDismissing(true);
    // The provider surfaces decision errors; the card only resets its state.
    onDismiss(approvalId)
      .catch(() => undefined)
      .finally(() => {
        setIsDismissing(false);
      });
  };

  return (
    <form
      aria-labelledby={titleId}
      className="bg-card text-foreground border-border rounded-xl border shadow-xs"
      onSubmit={handleFormSubmit}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        {stepCount > 1 ? (
          <Badge
            text={`${stepIndex + 1}/${stepCount}`}
            size="sm"
            color="filled"
          />
        ) : null}
        <h3 id={titleId} className="min-w-0 flex-1 text-sm leading-5 font-bold">
          {question.question}
        </h3>
        <IconButton
          icon={isCollapsed ? ChevronDown : ChevronUp}
          label={isCollapsed ? "Expand questions" : "Collapse questions"}
          size="sm"
          aria-expanded={!isCollapsed}
          onClick={handleToggleCollapsed}
        />
        <IconButton
          icon={X}
          label="Dismiss questions"
          size="sm"
          disabled={isBusy}
          onClick={handleDismiss}
        />
      </div>
      {isCollapsed ? null : (
        <>
          <QuestionnaireStep
            key={stepIndex}
            control={form.control}
            question={question}
            questionIndex={stepIndex}
            isDisabled={isBusy}
          />
          <div className="flex items-center gap-2 px-3 pb-3">
            {stepIndex > 0 ? (
              <Button
                text="Back"
                variant="ghost"
                size="sm"
                disabled={isBusy}
                onClick={handleBack}
              />
            ) : null}
            <span className="flex-1" />
            <Button
              text="Skip"
              variant="secondary"
              size="sm"
              disabled={isBusy}
              onClick={handleSkip}
            />
            <Button
              text={isLastStep ? "Submit" : "Next"}
              size="sm"
              shortcutKeys={["Mod", "Enter"]}
              disabled={isDisabled}
              loading={isSubmitting || form.formState.isSubmitting}
              onClick={goToNextStep}
            />
          </div>
        </>
      )}
    </form>
  );
}
