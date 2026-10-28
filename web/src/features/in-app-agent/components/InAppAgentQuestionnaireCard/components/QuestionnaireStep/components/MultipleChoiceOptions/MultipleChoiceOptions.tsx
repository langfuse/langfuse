import { useId, type Ref } from "react";
import { PencilLine } from "@langfuse/icons";
import type { InAppAgentQuestionnaireQuestion } from "@langfuse/shared/in-app-agent";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import type { QuestionnaireFormAnswer } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/createQuestionnaireFormValues";
import { OtherAnswerInput } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/components/QuestionnaireStep/components/OtherAnswerInput/OtherAnswerInput";
import { OptionList } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/components/QuestionnaireStep/components/OptionList/OptionList";
import { OptionRowFrame } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/components/QuestionnaireStep/components/OptionRowFrame/OptionRowFrame";
import {
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
    <OptionList>
      <div>
        {question.options.map((option, optionIndex) => (
          <CheckboxOptionRow
            key={optionIndex}
            id={`${idPrefix}-${optionIndex}`}
            optionIndex={optionIndex}
            option={option}
            isChecked={answer.selectedOptionIndexes.includes(optionIndex)}
            isDisabled={isDisabled}
            onToggleOption={onToggleOption}
          />
        ))}
        <CheckboxOtherAnswerRow
          id={`${idPrefix}-other`}
          isOtherOpen={isOtherOpen}
          otherText={answer.otherText}
          isDisabled={isDisabled}
          otherInputRef={otherInputRef}
          onToggleOther={onToggleOther}
          onOtherTextChange={onOtherTextChange}
        />
      </div>
    </OptionList>
  );
}

type CheckboxOptionRowProps = Pick<
  MultipleChoiceOptionsProps,
  "isDisabled" | "onToggleOption"
> & {
  id: string;
  optionIndex: number;
  option: InAppAgentQuestionnaireQuestion["options"][number];
  isChecked: boolean;
};

function CheckboxOptionRow({
  id,
  optionIndex,
  option,
  isChecked,
  isDisabled,
  onToggleOption,
}: CheckboxOptionRowProps) {
  return (
    <OptionRowFrame>
      <label htmlFor={id}>
        <span className="flex h-5 shrink-0 items-center">
          <Checkbox
            id={id}
            checked={isChecked}
            disabled={isDisabled}
            onCheckedChange={() => {
              onToggleOption(optionIndex);
            }}
          />
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

type CheckboxOtherAnswerRowProps = Pick<
  MultipleChoiceOptionsProps,
  | "isOtherOpen"
  | "isDisabled"
  | "otherInputRef"
  | "onToggleOther"
  | "onOtherTextChange"
> & {
  id: string;
  otherText: string;
};

function CheckboxOtherAnswerRow({
  id,
  isOtherOpen,
  otherText,
  isDisabled,
  otherInputRef,
  onToggleOther,
  onOtherTextChange,
}: CheckboxOtherAnswerRowProps) {
  return (
    <OptionRowFrame>
      <label htmlFor={id}>
        <span className="flex h-5 shrink-0 items-center">
          <Checkbox
            id={id}
            checked={isOtherOpen || otherText.trim().length > 0}
            disabled={isDisabled}
            onCheckedChange={onToggleOther}
          />
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
