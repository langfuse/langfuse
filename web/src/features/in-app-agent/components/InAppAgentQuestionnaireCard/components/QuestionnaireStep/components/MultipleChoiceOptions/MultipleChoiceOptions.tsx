import { useId, type Ref } from "react";
import { PencilLine } from "lucide-react";
import type { InAppAgentQuestionnaireQuestion } from "@langfuse/shared/in-app-agent";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
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

export type MultipleChoiceOptionsProps = {
  question: InAppAgentQuestionnaireQuestion;
  answer: QuestionnaireFormAnswer;
  isOtherOpen: boolean;
  isDisabled: boolean;
  otherInputRef: Ref<HTMLInputElement>;
  onToggleOption: (optionIndex: number) => void;
  onToggleOther: () => void;
  onOtherTextChange: (otherText: string) => void;
};

export function MultipleChoiceOptions({
  question,
  answer,
  isOtherOpen,
  isDisabled,
  otherInputRef,
  onToggleOption,
  onToggleOther,
  onOtherTextChange,
}: MultipleChoiceOptionsProps) {
  const idPrefix = useId();

  return (
    <div className={OPTION_LIST_CLASS_NAME}>
      {question.options.map((option, optionIndex) => (
        <CheckboxOptionRow
          key={optionIndex}
          id={`${idPrefix}-${optionIndex}`}
          optionIndex={optionIndex}
          label={withRecommended(option.label, option.recommended)}
          description={option.description}
          isChecked={answer.selectedOptionIndexes.includes(optionIndex)}
          isDisabled={isDisabled}
          onToggle={onToggleOption}
        />
      ))}
      <CheckboxOtherAnswerRow
        id={`${idPrefix}-other`}
        isOpen={isOtherOpen}
        otherText={answer.otherText}
        isDisabled={isDisabled}
        otherInputRef={otherInputRef}
        onToggle={onToggleOther}
        onOtherTextChange={onOtherTextChange}
      />
    </div>
  );
}

type CheckboxOptionRowProps = {
  id: string;
  optionIndex: number;
  label: string;
  description: string;
  isChecked: boolean;
  isDisabled: boolean;
  onToggle: (optionIndex: number) => void;
};

function CheckboxOptionRow({
  id,
  optionIndex,
  label,
  description,
  isChecked,
  isDisabled,
  onToggle,
}: CheckboxOptionRowProps) {
  const handleCheckedChange = () => {
    onToggle(optionIndex);
  };

  return (
    <label htmlFor={id} className={OPTION_ROW_CLASS_NAME}>
      <span className={OPTION_CONTROL_CLASS_NAME}>
        <Checkbox
          id={id}
          checked={isChecked}
          disabled={isDisabled}
          onCheckedChange={handleCheckedChange}
        />
      </span>
      <span className={OPTION_TEXT_CLASS_NAME}>
        <span className="leading-5">{label}</span>
        <span className="text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

type CheckboxOtherAnswerRowProps = {
  id: string;
  isOpen: boolean;
  otherText: string;
  isDisabled: boolean;
  otherInputRef: Ref<HTMLInputElement>;
  onToggle: () => void;
  onOtherTextChange: (otherText: string) => void;
};

function CheckboxOtherAnswerRow({
  id,
  isOpen,
  otherText,
  isDisabled,
  otherInputRef,
  onToggle,
  onOtherTextChange,
}: CheckboxOtherAnswerRowProps) {
  return (
    <label htmlFor={id} className={OPTION_ROW_CLASS_NAME}>
      <span className={OPTION_CONTROL_CLASS_NAME}>
        <Checkbox
          id={id}
          checked={isOpen || otherText.trim().length > 0}
          disabled={isDisabled}
          onCheckedChange={onToggle}
        />
      </span>
      <span className={OPTION_TEXT_CLASS_NAME}>
        <span className="flex items-center gap-1.5 leading-5">
          {OTHER_ANSWER_LABEL}
          <PencilLine aria-hidden className="text-muted-foreground icon-sm" />
        </span>
        {isOpen ? (
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
