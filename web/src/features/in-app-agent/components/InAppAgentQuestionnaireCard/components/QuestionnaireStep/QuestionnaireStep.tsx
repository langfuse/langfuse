"use client";

import {
  useId,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { ArrowRight, ArrowUp } from "lucide-react";
import { useController, type Control } from "react-hook-form";
import {
  IN_APP_AGENT_QUESTIONNAIRE_MAX_ANSWER_LENGTH,
  type InAppAgentQuestionnaireQuestion,
} from "@langfuse/shared/in-app-agent";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import type { QuestionnaireFormValues } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/createQuestionnaireFormValues";
import { updateQuestionnaireAnswer } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/updateQuestionnaireAnswer";

export type QuestionnaireStepProps = {
  control: Control<QuestionnaireFormValues>;
  question: InAppAgentQuestionnaireQuestion;
  questionIndex: number;
  submitLabel: string;
  isDisabled: boolean;
  onAdvance: () => void;
  onSkip: () => void;
};

/**
 * Single-choice questions advance as soon as an option is picked, like a
 * menu. Multi-choice questions collect toggles and advance from the footer.
 * Number keys pick or toggle the matching option while focus is in the step.
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
  const { field } = useController({
    control,
    name: `answers.${questionIndex}`,
  });
  const answer = field.value;
  const hasOtherText = answer.otherText.trim().length > 0;

  const handleSelectOption = (optionIndex: number) => {
    field.onChange(
      updateQuestionnaireAnswer(answer, question, {
        type: "selectOption",
        optionIndex,
      }),
    );
    onAdvance();
  };

  const handleToggleOption = (optionIndex: number) => {
    field.onChange(
      updateQuestionnaireAnswer(answer, question, {
        type: "toggleOption",
        optionIndex,
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

  const handleClearOtherText = () => {
    field.onChange(
      updateQuestionnaireAnswer(answer, question, {
        type: "setOtherText",
        otherText: "",
      }),
    );
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
    } else {
      handleSelectOption(optionIndex);
    }
  };

  const submitButton = (
    <Button
      text={submitLabel}
      icon={ArrowUp}
      size="sm"
      type="submit"
      disabled={isDisabled}
    />
  );
  const skipButton = (
    <Button
      text="Skip"
      variant="secondary"
      size="sm"
      disabled={isDisabled}
      onClick={onSkip}
    />
  );

  if (!question.allowMultiple) {
    return (
      <div className="flex flex-col px-1.5 pb-1.5" onKeyDown={handleKeyDown}>
        <div className="border-border flex flex-col border-b pb-1">
          {question.options.map((option, optionIndex) => (
            <SingleChoiceRow
              key={optionIndex}
              optionIndex={optionIndex}
              label={option.label}
              description={option.description}
              isRecommended={option.recommended}
              isSelected={answer.selectedOptionIndexes.includes(optionIndex)}
              // A typed answer replaces the options, so they recede.
              isDimmed={hasOtherText}
              isDisabled={isDisabled}
              onSelect={handleSelectOption}
            />
          ))}
        </div>
        <OtherAnswerRow
          value={answer.otherText}
          isDisabled={isDisabled}
          onChange={handleOtherTextChange}
        >
          {hasOtherText ? submitButton : skipButton}
        </OtherAnswerRow>
      </div>
    );
  }

  const selectedCount =
    answer.selectedOptionIndexes.length + (hasOtherText ? 1 : 0);

  return (
    <div onKeyDown={handleKeyDown}>
      <div className="flex flex-col px-1.5 pb-1.5">
        {question.options.map((option, optionIndex) => (
          <MultipleChoiceRow
            key={optionIndex}
            optionIndex={optionIndex}
            label={option.label}
            description={option.description}
            isRecommended={option.recommended}
            isSelected={answer.selectedOptionIndexes.includes(optionIndex)}
            isDisabled={isDisabled}
            onToggle={handleToggleOption}
          />
        ))}
        <MultipleChoiceOtherRow
          value={answer.otherText}
          isChecked={hasOtherText}
          isDisabled={isDisabled}
          onChange={handleOtherTextChange}
          onClear={handleClearOtherText}
        />
      </div>
      <div className="border-border flex items-center gap-2 border-t px-3 py-2">
        <span className="text-muted-foreground flex-1 text-xs">
          {selectedCount} selected
        </span>
        {skipButton}
        <Button
          text={submitLabel}
          icon={ArrowUp}
          size="sm"
          type="submit"
          disabled={isDisabled || selectedCount === 0}
        />
      </div>
    </div>
  );
}

type SingleChoiceRowProps = {
  optionIndex: number;
  label: string;
  description: string | null;
  isRecommended: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  isDisabled: boolean;
  onSelect: (optionIndex: number) => void;
};

function SingleChoiceRow({
  optionIndex,
  label,
  description,
  isRecommended,
  isSelected,
  isDimmed,
  isDisabled,
  onSelect,
}: SingleChoiceRowProps) {
  const handleClick = () => {
    onSelect(optionIndex);
  };

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      data-dimmed={isDimmed}
      disabled={isDisabled}
      className="group hover:bg-muted focus-visible:bg-muted aria-pressed:bg-muted flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-opacity focus-visible:outline-hidden disabled:cursor-not-allowed data-[dimmed=true]:opacity-50"
      onClick={handleClick}
    >
      <OptionText
        label={label}
        description={description}
        isRecommended={isRecommended}
      />
      <ArrowRight
        aria-hidden
        className="text-muted-foreground icon-base invisible shrink-0 group-hover:visible group-focus-visible:visible group-aria-pressed:visible"
      />
    </button>
  );
}

type MultipleChoiceRowProps = {
  optionIndex: number;
  label: string;
  description: string | null;
  isRecommended: boolean;
  isSelected: boolean;
  isDisabled: boolean;
  onToggle: (optionIndex: number) => void;
};

function MultipleChoiceRow({
  optionIndex,
  label,
  description,
  isRecommended,
  isSelected,
  isDisabled,
  onToggle,
}: MultipleChoiceRowProps) {
  const id = useId();

  const handleCheckedChange = () => {
    onToggle(optionIndex);
  };

  return (
    <label
      htmlFor={id}
      className="hover:bg-muted has-focus-visible:bg-muted flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 text-sm has-disabled:cursor-not-allowed"
    >
      <span className="flex h-5 shrink-0 items-center">
        <Checkbox
          id={id}
          checked={isSelected}
          disabled={isDisabled}
          onCheckedChange={handleCheckedChange}
        />
      </span>
      <OptionText
        label={label}
        description={description}
        isRecommended={isRecommended}
      />
    </label>
  );
}

type OptionTextProps = {
  label: string;
  description: string | null;
  isRecommended: boolean;
};

function OptionText({ label, description, isRecommended }: OptionTextProps) {
  return (
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
  );
}

type OtherAnswerRowProps = {
  value: string;
  isDisabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  children?: ReactNode;
};

function OtherAnswerRow({
  value,
  isDisabled,
  onChange,
  children,
}: OtherAnswerRowProps) {
  return (
    <div className="pt-1">
      <div className="has-focus-visible:bg-muted flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5">
        <OtherAnswerInput
          value={value}
          isDisabled={isDisabled}
          onChange={onChange}
        />
        {children}
      </div>
    </div>
  );
}

type MultipleChoiceOtherRowProps = {
  value: string;
  isChecked: boolean;
  isDisabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
};

/**
 * The checkbox mirrors whether a custom answer is typed: checking it focuses
 * the input, unchecking it clears the text.
 */
function MultipleChoiceOtherRow({
  value,
  isChecked,
  isDisabled,
  onChange,
  onClear,
}: MultipleChoiceOtherRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCheckedChange = (checked: CheckedState) => {
    if (checked === true) {
      inputRef.current?.focus();
      return;
    }
    onClear();
  };

  return (
    <div className="hover:bg-muted has-focus-visible:bg-muted flex items-center gap-3 rounded-lg px-2 py-2">
      <span className="flex h-5 shrink-0 items-center">
        <Checkbox
          aria-label="Use a custom answer"
          checked={isChecked}
          disabled={isDisabled}
          onCheckedChange={handleCheckedChange}
        />
      </span>
      <OtherAnswerInput
        ref={inputRef}
        value={value}
        isDisabled={isDisabled}
        onChange={onChange}
      />
    </div>
  );
}

type OtherAnswerInputProps = {
  ref?: Ref<HTMLInputElement>;
  value: string;
  isDisabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

function OtherAnswerInput({
  ref,
  value,
  isDisabled,
  onChange,
}: OtherAnswerInputProps) {
  return (
    // The design-system Input is always boxed; this row reads as a list item.
    <input
      ref={ref}
      aria-label="Something else"
      placeholder="Something else"
      maxLength={IN_APP_AGENT_QUESTIONNAIRE_MAX_ANSWER_LENGTH}
      value={value}
      disabled={isDisabled}
      className="placeholder:text-muted-foreground min-w-0 flex-1 border-0 bg-transparent p-0 text-sm leading-5 focus:ring-0 focus:outline-hidden disabled:cursor-not-allowed"
      onChange={onChange}
    />
  );
}
