"use client";

import { useId, type ChangeEvent, type ReactNode } from "react";
import { useController, type Control } from "react-hook-form";
import type { InAppAgentQuestionnaireQuestion } from "@langfuse/shared/in-app-agent";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Input } from "@/src/components/design-system/Input/Input";
import { RadioGroup } from "@/src/components/design-system/RadioGroup/RadioGroup";
import type { QuestionnaireFormValues } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/createQuestionnaireFormValues";
import { updateQuestionnaireAnswer } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/updateQuestionnaireAnswer";

const OTHER_VALUE = "other";

export type QuestionnaireStepProps = {
  control: Control<QuestionnaireFormValues>;
  question: InAppAgentQuestionnaireQuestion;
  questionIndex: number;
  isDisabled: boolean;
};

export function QuestionnaireStep({
  control,
  question,
  questionIndex,
  isDisabled,
}: QuestionnaireStepProps) {
  const idPrefix = useId();
  const { field } = useController({
    control,
    name: `answers.${questionIndex}`,
  });
  const answer = field.value;
  const selectionMode = question.allowMultiple ? "multiple" : "single";

  // Radix radios only report changes, so toggling serves both control kinds.
  const handleToggleValue = (value: string) => {
    field.onChange(
      updateQuestionnaireAnswer(
        answer,
        question,
        value === OTHER_VALUE
          ? { type: "toggleOther" }
          : { type: "toggleOption", optionIndex: Number(value) },
      ),
    );
  };

  const handleOtherTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    field.onChange(
      updateQuestionnaireAnswer(answer, question, {
        type: "setOtherText",
        otherText: event.target.value,
      }),
    );
  };

  if (question.options.length === 0) {
    return (
      <div className="px-3 pb-3">
        <Input
          aria-label="Your answer"
          placeholder="Type your answer"
          value={answer.otherText}
          disabled={isDisabled}
          onChange={handleOtherTextChange}
        />
      </div>
    );
  }

  const tiles = (
    <>
      {question.options.map((option, optionIndex) => (
        <QuestionnaireOptionTile
          key={optionIndex}
          id={`${idPrefix}-option-${optionIndex}`}
          value={String(optionIndex)}
          selectionMode={selectionMode}
          label={option.label}
          description={option.description}
          isRecommended={option.recommended}
          isSelected={answer.selectedOptionIndexes.includes(optionIndex)}
          isDisabled={isDisabled}
          onToggle={handleToggleValue}
        />
      ))}
      {question.allowOther ? (
        <QuestionnaireOptionTile
          id={`${idPrefix}-other`}
          value={OTHER_VALUE}
          selectionMode={selectionMode}
          label="Other"
          description={null}
          isRecommended={false}
          isSelected={answer.isOtherSelected}
          isDisabled={isDisabled}
          onToggle={handleToggleValue}
        >
          <Input
            aria-label="Other answer"
            placeholder="Type your answer"
            value={answer.otherText}
            disabled={isDisabled}
            onChange={handleOtherTextChange}
          />
        </QuestionnaireOptionTile>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-3">
      {selectionMode === "single" ? (
        <RadioGroup
          value={getSingleSelectionValue(answer)}
          onValueChange={handleToggleValue}
        >
          {tiles}
        </RadioGroup>
      ) : (
        tiles
      )}
    </div>
  );
}

type QuestionnaireOptionTileProps = {
  id: string;
  value: string;
  selectionMode: "single" | "multiple";
  label: string;
  description: string | null;
  isRecommended: boolean;
  isSelected: boolean;
  isDisabled: boolean;
  onToggle: (value: string) => void;
  children?: ReactNode;
};

function QuestionnaireOptionTile({
  id,
  value,
  selectionMode,
  label,
  description,
  isRecommended,
  isSelected,
  isDisabled,
  onToggle,
  children,
}: QuestionnaireOptionTileProps) {
  const handleCheckedChange = () => {
    onToggle(value);
  };

  return (
    <div
      data-selected={isSelected}
      className="border-border data-[selected=true]:border-primary/60 data-[selected=true]:bg-accent/60 flex flex-col gap-2 rounded-lg border px-3 py-2"
    >
      <label
        htmlFor={id}
        className="flex cursor-pointer items-start gap-2.5 text-sm"
      >
        <span className="flex h-5 shrink-0 items-center">
          {selectionMode === "single" ? (
            <RadioGroup.Item id={id} value={value} disabled={isDisabled} />
          ) : (
            <Checkbox
              id={id}
              checked={isSelected}
              disabled={isDisabled}
              onCheckedChange={handleCheckedChange}
            />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5">
            {label}
            {isRecommended ? (
              <Badge text="Recommended" size="sm" color="green" />
            ) : null}
          </span>
          {description ? (
            <span className="text-muted-foreground text-xs">{description}</span>
          ) : null}
        </span>
      </label>
      {children}
    </div>
  );
}

function getSingleSelectionValue(
  answer: QuestionnaireFormValues["answers"][number],
) {
  if (answer.isOtherSelected) {
    return OTHER_VALUE;
  }

  return answer.selectedOptionIndexes.length > 0
    ? String(answer.selectedOptionIndexes[0])
    : "";
}
