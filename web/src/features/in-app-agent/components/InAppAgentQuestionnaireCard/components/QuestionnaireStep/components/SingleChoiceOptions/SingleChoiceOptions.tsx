import { useId, useRef, type Ref } from "react";
import { PencilLine } from "lucide-react";
import type { InAppAgentQuestionnaireQuestion } from "@langfuse/shared/in-app-agent";
import { RadioGroup } from "@/src/components/design-system/RadioGroup/RadioGroup";
import type { QuestionnaireFormAnswer } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/createQuestionnaireFormValues";
import { OtherAnswerInput } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/components/QuestionnaireStep/components/OtherAnswerInput/OtherAnswerInput";
import {
  OPTION_CONTROL_CLASS_NAME,
  OPTION_LIST_CLASS_NAME,
  OPTION_ROW_CLASS_NAME,
  OPTION_TEXT_CLASS_NAME,
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
      <div
        className={OPTION_LIST_CLASS_NAME}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
      >
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
    <label htmlFor={id} className={OPTION_ROW_CLASS_NAME}>
      <span className={OPTION_CONTROL_CLASS_NAME}>
        <RadioGroup.Item id={id} value={value} disabled={isDisabled} />
      </span>
      <span className={OPTION_TEXT_CLASS_NAME}>
        <span className="leading-5">
          {withRecommended(option.label, option.recommended)}
        </span>
        <span className="text-muted-foreground">{option.description}</span>
      </span>
    </label>
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
    <label htmlFor={id} className={OPTION_ROW_CLASS_NAME}>
      <span className={OPTION_CONTROL_CLASS_NAME}>
        <RadioGroup.Item id={id} value={OTHER_VALUE} disabled={isDisabled} />
      </span>
      <span className={OPTION_TEXT_CLASS_NAME}>
        <span className="flex items-center gap-1.5 leading-5">
          {OTHER_ANSWER_LABEL}
          <PencilLine aria-hidden className="text-muted-foreground icon-sm" />
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
  );
}
