import { useId, useRef, type Ref } from "react";
import { PencilLine } from "@langfuse/icons";
import type { InAppAgentQuestionnaireQuestion } from "@langfuse/shared/in-app-agent";
import { RadioGroup } from "@/src/components/design-system/RadioGroup/RadioGroup";
import type { QuestionnaireFormAnswer } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/createQuestionnaireFormValues";
import { OtherAnswerInput } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/components/QuestionnaireStep/components/OtherAnswerInput/OtherAnswerInput";
import { OptionList } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/components/QuestionnaireStep/components/OptionList/OptionList";
import { OptionRowFrame } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/components/QuestionnaireStep/components/OptionRowFrame/OptionRowFrame";
import {
  OTHER_ANSWER_LABEL,
  withRecommended,
} from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/components/QuestionnaireStep/optionRow";

const OTHER_VALUE = "other";

export type SingleChoiceOptionsProps = {
  question: InAppAgentQuestionnaireQuestion;
  answer: QuestionnaireFormAnswer;
  isOtherOpen: boolean;
  isDisabled: boolean;
  otherInputRef: Ref<HTMLInputElement>;
  onSelectOption: (optionIndex: number) => void;
  onSelectOther: () => void;
  onOtherTextChange: (otherText: string) => void;
  onAdvance: () => void;
};

/**
 * Clicking an option moves on right away; arrow keys only move the
 * selection, so keyboard users confirm from the footer.
 */
export function SingleChoiceOptions({
  question,
  answer,
  isOtherOpen,
  isDisabled,
  otherInputRef,
  onSelectOption,
  onSelectOther,
  onOtherTextChange,
  onAdvance,
}: SingleChoiceOptionsProps) {
  const idPrefix = useId();
  const isPointerPickRef = useRef(false);

  const handleValueChange = (value: string) => {
    if (value === OTHER_VALUE) {
      onSelectOther();
      return;
    }
    onSelectOption(Number(value));
    if (isPointerPickRef.current) {
      onAdvance();
    }
  };

  const handlePointerDown = () => {
    isPointerPickRef.current = true;
  };

  const handleKeyDown = () => {
    isPointerPickRef.current = false;
  };

  return (
    <RadioGroup
      value={radioValue(answer.selectedOptionIndexes, isOtherOpen)}
      onValueChange={handleValueChange}
    >
      <OptionList>
        <div onPointerDown={handlePointerDown} onKeyDown={handleKeyDown}>
          {question.options.map((option, optionIndex) => (
            <RadioOptionRow
              key={optionIndex}
              id={`${idPrefix}-${optionIndex}`}
              value={String(optionIndex)}
              option={option}
              isDisabled={isDisabled}
            />
          ))}
          <RadioOtherAnswerRow
            id={`${idPrefix}-${OTHER_VALUE}`}
            isOtherOpen={isOtherOpen}
            otherText={answer.otherText}
            isDisabled={isDisabled}
            otherInputRef={otherInputRef}
            onOtherTextChange={onOtherTextChange}
          />
        </div>
      </OptionList>
    </RadioGroup>
  );
}

function radioValue(selectedOptionIndexes: number[], isOtherOpen: boolean) {
  if (isOtherOpen) {
    return OTHER_VALUE;
  }
  const [selected] = selectedOptionIndexes;
  return selected === undefined ? "" : String(selected);
}

type RadioOptionRowProps = Pick<SingleChoiceOptionsProps, "isDisabled"> & {
  id: string;
  value: string;
  option: InAppAgentQuestionnaireQuestion["options"][number];
};

function RadioOptionRow({
  id,
  value,
  option,
  isDisabled,
}: RadioOptionRowProps) {
  return (
    <OptionRowFrame>
      <label htmlFor={id}>
        <span className="flex h-5 shrink-0 items-center">
          <RadioGroup.Item id={id} value={value} disabled={isDisabled} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="leading-5">
            {withRecommended(option.label, option.recommended)}
          </span>
          <span className="text-muted-foreground">{option.description}</span>
        </span>
      </label>
    </OptionRowFrame>
  );
}

type RadioOtherAnswerRowProps = Pick<
  SingleChoiceOptionsProps,
  "isOtherOpen" | "isDisabled" | "otherInputRef" | "onOtherTextChange"
> & {
  id: string;
  otherText: string;
};

function RadioOtherAnswerRow({
  id,
  isOtherOpen,
  otherText,
  isDisabled,
  otherInputRef,
  onOtherTextChange,
}: RadioOtherAnswerRowProps) {
  return (
    <OptionRowFrame>
      <label htmlFor={id}>
        <span className="flex h-5 shrink-0 items-center">
          <RadioGroup.Item id={id} value={OTHER_VALUE} disabled={isDisabled} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 leading-5">
            {OTHER_ANSWER_LABEL}
            <PencilLine aria-hidden size="sm" color="muted" />
          </span>
          {isOtherOpen ? (
            <OtherAnswerInput
              ref={otherInputRef}
              value={otherText}
              isDisabled={isDisabled}
              onChange={onOtherTextChange}
            />
          ) : null}
        </span>
      </label>
    </OptionRowFrame>
  );
}
