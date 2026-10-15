"use client";

import { useId, type ChangeEvent } from "react";
import { ArrowUp } from "lucide-react";
import { useController, type Control } from "react-hook-form";
import {
  IN_APP_AGENT_QUESTIONNAIRE_MAX_ANSWER_LENGTH,
  type InAppAgentQuestionnaireQuestion,
} from "@langfuse/shared/in-app-agent";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Input } from "@/src/components/design-system/Input/Input";
import { RadioGroup } from "@/src/components/design-system/RadioGroup/RadioGroup";
import type { QuestionnaireFormValues } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/createQuestionnaireFormValues";
import { updateQuestionnaireAnswer } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/updateQuestionnaireAnswer";

export type QuestionnaireStepProps = {
  control: Control<QuestionnaireFormValues>;
  question: InAppAgentQuestionnaireQuestion;
  questionIndex: number;
  submitLabel: string;
  isDisabled: boolean;
  onSkip: () => void;
};

export function QuestionnaireStep({
  control,
  question,
  questionIndex,
  submitLabel,
  isDisabled,
  onSkip,
}: QuestionnaireStepProps) {
  const idPrefix = useId();
  const { field } = useController({
    control,
    name: `answers.${questionIndex}`,
  });
  const answer = field.value;
  const selectionMode = question.allowMultiple ? "multiple" : "single";
  const hasOtherText = answer.otherText.trim().length > 0;
  // A typed single-choice answer replaces the options, so they recede.
  const areOptionsDimmed = selectionMode === "single" && hasOtherText;

  // Radix radios only report changes, so toggling serves both control kinds.
  const handleToggleValue = (value: string) => {
    field.onChange(
      updateQuestionnaireAnswer(answer, question, {
        type: "toggleOption",
        optionIndex: Number(value),
      }),
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
          isDimmed={areOptionsDimmed}
          isDisabled={isDisabled}
          onToggle={handleToggleValue}
        />
      ))}
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
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input
            aria-label="Something else"
            placeholder="Something else"
            maxLength={IN_APP_AGENT_QUESTIONNAIRE_MAX_ANSWER_LENGTH}
            value={answer.otherText}
            disabled={isDisabled}
            onChange={handleOtherTextChange}
          />
        </div>
        {hasOtherText ? (
          <Button
            text={submitLabel}
            icon={ArrowUp}
            size="sm"
            type="submit"
            disabled={isDisabled}
          />
        ) : (
          <Button
            text="Skip"
            variant="secondary"
            size="sm"
            disabled={isDisabled}
            onClick={onSkip}
          />
        )}
      </div>
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
  isDimmed: boolean;
  isDisabled: boolean;
  onToggle: (value: string) => void;
};

function QuestionnaireOptionTile({
  id,
  value,
  selectionMode,
  label,
  description,
  isRecommended,
  isSelected,
  isDimmed,
  isDisabled,
  onToggle,
}: QuestionnaireOptionTileProps) {
  const handleCheckedChange = () => {
    onToggle(value);
  };

  return (
    <div
      data-selected={isSelected}
      data-dimmed={isDimmed}
      className="border-border data-[selected=true]:border-primary/60 data-[selected=true]:bg-accent/60 flex flex-col gap-2 rounded-lg border px-3 py-2 transition-opacity data-[dimmed=true]:opacity-50"
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
    </div>
  );
}

function getSingleSelectionValue(
  answer: QuestionnaireFormValues["answers"][number],
) {
  return answer.selectedOptionIndexes.length > 0
    ? String(answer.selectedOptionIndexes[0])
    : "";
}
