"use client";

import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { PencilLine, type LucideIcon } from "lucide-react";
import { useController, type Control } from "react-hook-form";
import {
  IN_APP_AGENT_QUESTIONNAIRE_MAX_ANSWER_LENGTH,
  type InAppAgentQuestionnaireQuestion,
} from "@langfuse/shared/in-app-agent";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Input } from "@/src/components/design-system/Input/Input";
import { RadioGroup } from "@/src/components/design-system/RadioGroup/RadioGroup";
import type { QuestionnaireFormValues } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/createQuestionnaireFormValues";
import { updateQuestionnaireAnswer } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/updateQuestionnaireAnswer";

const OTHER_ANSWER_LABEL = "Type your answer";
const OTHER_VALUE = "other";

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
 * a checkbox. Clicking a single-choice option or pressing its number moves on;
 * arrow keys only move the selection. A typed answer turns Skip into Submit;
 * multiple choice confirms from the footer.
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
  const idPrefix = useId();
  const otherInputRef = useRef<HTMLInputElement>(null);
  const isPointerPickRef = useRef(false);
  const { field } = useController({
    control,
    name: `answers.${questionIndex}`,
  });
  const answer = field.value;
  const hasOtherText = answer.otherText.trim().length > 0;
  const [isOtherOpen, setIsOtherOpen] = useState(hasOtherText);
  const selectedCount =
    answer.selectedOptionIndexes.length + (hasOtherText ? 1 : 0);

  const openOther = () => {
    flushSync(() => {
      setIsOtherOpen(true);
    });
    otherInputRef.current?.focus();
  };

  const handlePickOption = (optionIndex: number) => {
    if (question.allowMultiple) {
      field.onChange(
        updateQuestionnaireAnswer(answer, question, {
          type: "toggleOption",
          optionIndex,
        }),
      );
      return;
    }
    field.onChange(
      updateQuestionnaireAnswer(answer, question, {
        type: "selectOption",
        optionIndex,
      }),
    );
    setIsOtherOpen(false);
  };

  const handlePickOther = () => {
    field.onChange(
      updateQuestionnaireAnswer(answer, question, { type: "selectOther" }),
    );
    openOther();
  };

  const handleToggleOther = () => {
    if (!isOtherOpen) {
      openOther();
      return;
    }
    field.onChange(
      updateQuestionnaireAnswer(answer, question, {
        type: "setOtherText",
        otherText: "",
      }),
    );
    setIsOtherOpen(false);
  };

  const handleRadioValueChange = (value: string) => {
    if (value === OTHER_VALUE) {
      handlePickOther();
      return;
    }
    handlePickOption(Number(value));
    if (isPointerPickRef.current) {
      onAdvance();
    }
  };

  const handleRadioPointerDown = () => {
    isPointerPickRef.current = true;
  };

  const handleOtherTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    field.onChange(
      updateQuestionnaireAnswer(answer, question, {
        type: "setOtherText",
        otherText: event.target.value,
      }),
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    isPointerPickRef.current = false;
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
    handlePickOption(optionIndex);
    if (!question.allowMultiple) {
      onAdvance();
    }
  };

  // Single choice: Skip until a custom answer is typed, then it turns into Submit.
  const showsSkip = question.allowMultiple || !hasOtherText;
  const showsSubmit = question.allowMultiple || hasOtherText;
  const optionId = (key: number | string) => `${idPrefix}-${key}`;
  const otherInput = isOtherOpen ? (
    <div className="pt-1.5">
      <Input
        ref={otherInputRef}
        aria-label="Custom answer"
        placeholder="Type your own answer"
        maxLength={IN_APP_AGENT_QUESTIONNAIRE_MAX_ANSWER_LENGTH}
        value={answer.otherText}
        disabled={isDisabled}
        onChange={handleOtherTextChange}
      />
    </div>
  ) : null;

  return (
    <div onKeyDown={handleKeyDown}>
      {question.allowMultiple ? (
        <div className="divide-border border-border divide-y border-b">
          {question.options.map((option, optionIndex) => (
            <MultipleChoiceRow
              key={optionIndex}
              id={optionId(optionIndex)}
              optionIndex={optionIndex}
              label={option.label}
              description={option.description}
              isRecommended={option.recommended}
              isChecked={answer.selectedOptionIndexes.includes(optionIndex)}
              isDisabled={isDisabled}
              onToggle={handlePickOption}
            />
          ))}
          <OptionRow
            htmlFor={optionId(OTHER_VALUE)}
            label={OTHER_ANSWER_LABEL}
            labelIcon={PencilLine}
            below={otherInput}
          >
            <Checkbox
              size="sm"
              id={optionId(OTHER_VALUE)}
              checked={isOtherOpen || hasOtherText}
              disabled={isDisabled}
              onCheckedChange={handleToggleOther}
            />
          </OptionRow>
        </div>
      ) : (
        <RadioGroup
          spacing="none"
          value={radioValue(answer.selectedOptionIndexes, isOtherOpen)}
          onValueChange={handleRadioValueChange}
        >
          <div
            className="divide-border border-border divide-y border-b"
            onPointerDown={handleRadioPointerDown}
          >
            {question.options.map((option, optionIndex) => (
              <OptionRow
                key={optionIndex}
                htmlFor={optionId(optionIndex)}
                label={withRecommended(option.label, option.recommended)}
                description={option.description}
              >
                <RadioGroup.Item
                  size="sm"
                  id={optionId(optionIndex)}
                  value={String(optionIndex)}
                  disabled={isDisabled}
                />
              </OptionRow>
            ))}
            <OptionRow
              htmlFor={optionId(OTHER_VALUE)}
              label={OTHER_ANSWER_LABEL}
              labelIcon={PencilLine}
              below={otherInput}
            >
              <RadioGroup.Item
                size="sm"
                id={optionId(OTHER_VALUE)}
                value={OTHER_VALUE}
                disabled={isDisabled}
              />
            </OptionRow>
          </div>
        </RadioGroup>
      )}
      <div className="flex items-center justify-end gap-2 px-4 py-2">
        {showsSkip ? (
          <Button
            text="Skip"
            variant="outline"
            size="sm"
            disabled={isDisabled}
            onClick={onSkip}
          />
        ) : null}
        {showsSubmit ? (
          <Button
            text={submitLabel}
            size="sm"
            type="submit"
            disabled={isDisabled || selectedCount === 0}
          />
        ) : null}
      </div>
    </div>
  );
}

function radioValue(selectedOptionIndexes: number[], isOtherOpen: boolean) {
  if (isOtherOpen) {
    return OTHER_VALUE;
  }
  const [selected] = selectedOptionIndexes;
  return selected === undefined ? "" : String(selected);
}

function withRecommended(label: string, isRecommended: boolean) {
  return isRecommended ? `${label} (Recommended)` : label;
}

type MultipleChoiceRowProps = {
  id: string;
  optionIndex: number;
  label: string;
  description: string;
  isRecommended: boolean;
  isChecked: boolean;
  isDisabled: boolean;
  onToggle: (optionIndex: number) => void;
};

function MultipleChoiceRow({
  id,
  optionIndex,
  label,
  description,
  isRecommended,
  isChecked,
  isDisabled,
  onToggle,
}: MultipleChoiceRowProps) {
  const handleCheckedChange = () => {
    onToggle(optionIndex);
  };

  return (
    <OptionRow
      htmlFor={id}
      label={withRecommended(label, isRecommended)}
      description={description}
    >
      <Checkbox
        size="sm"
        id={id}
        checked={isChecked}
        disabled={isDisabled}
        onCheckedChange={handleCheckedChange}
      />
    </OptionRow>
  );
}

type OptionRowProps = {
  htmlFor: string;
  label: string;
  /** Shown after the label, like the pencil on the custom answer row. */
  labelIcon?: LucideIcon;
  description?: string;
  /** Shown under the label inside the row, like the custom answer field. */
  below?: ReactNode;
  /** The radio or checkbox. */
  children: ReactNode;
};

function OptionRow({
  htmlFor,
  label,
  labelIcon: LabelIcon,
  description,
  below,
  children,
}: OptionRowProps) {
  return (
    <label
      htmlFor={htmlFor}
      className="hover:bg-muted/50 has-focus-visible:bg-muted/50 flex cursor-pointer items-start gap-3 px-4 py-2 text-xs has-disabled:cursor-not-allowed"
    >
      <span className="flex h-5 shrink-0 items-center">{children}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5 leading-5">
          {label}
          {LabelIcon ? (
            <LabelIcon aria-hidden className="text-muted-foreground icon-sm" />
          ) : null}
        </span>
        {description ? (
          <span className="text-muted-foreground text-xs">{description}</span>
        ) : null}
        {below}
      </span>
    </label>
  );
}
