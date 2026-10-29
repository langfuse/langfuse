import type { Ref } from "react";
import { IN_APP_AGENT_QUESTIONNAIRE_MAX_ANSWER_LENGTH } from "@langfuse/shared/in-app-agent";
import { Input } from "@/src/components/design-system/Input/Input";
import { OTHER_ANSWER_LABEL } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/components/QuestionnaireStep/optionRow";

export type OtherAnswerInputProps = {
  ref: Ref<HTMLInputElement>;
  value: string;
  isDisabled: boolean;
  onChange: (value: string) => void;
};

export function OtherAnswerInput({
  ref,
  value,
  isDisabled,
  onChange,
}: OtherAnswerInputProps) {
  return (
    <div className="pt-1.5">
      <Input
        ref={ref}
        aria-label="Custom answer"
        placeholder={OTHER_ANSWER_LABEL}
        maxLength={IN_APP_AGENT_QUESTIONNAIRE_MAX_ANSWER_LENGTH}
        value={value}
        disabled={isDisabled}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}
