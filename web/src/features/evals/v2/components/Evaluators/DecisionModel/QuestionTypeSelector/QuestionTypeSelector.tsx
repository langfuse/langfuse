import { useId } from "react";
import { DecisionModelQuestionType } from "@langfuse/shared";
import {
  Gauge,
  ListChecks,
  ToggleLeft,
  type IconComponent,
} from "@langfuse/icons";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";

export const QUESTION_TYPE_COPY: Record<
  DecisionModelQuestionType,
  {
    label: string;
    icon: IconComponent;
    summary: string;
    writes: string;
    example: string;
    whenToUse: string;
  }
> = {
  [DecisionModelQuestionType.CHOICE]: {
    label: "Choice",
    icon: ListChecks,
    summary: "Pick one of a fixed set of labels.",
    writes: "a categorical score",
    example: "Which team should handle this ticket?",
    whenToUse:
      "The answer is one of a few options with no order between them. Add an “other” option if the list may not cover every input.",
  },
  [DecisionModelQuestionType.SCORE]: {
    label: "Score",
    icon: Gauge,
    summary: "Rate along ordered levels you describe.",
    writes: "a numeric score (the expected level)",
    example: "How frustrated is the customer?",
    whenToUse:
      "The answer sits on a spectrum you can describe in steps. Describe situations, not degrees: “broken but a workaround exists” beats “moderately severe”.",
  },
  [DecisionModelQuestionType.NOUL]: {
    label: "Yes / no",
    icon: ToggleLeft,
    summary: "Get the probability a statement is true.",
    writes: "a numeric score (probability 0–1)",
    example: "Does the message request a refund?",
    whenToUse:
      "A clean yes/no where the probability itself is the signal. Define the condition precisely; 0.5 means undecided, not “medium”.",
  },
};

const ORDER: DecisionModelQuestionType[] = [
  DecisionModelQuestionType.CHOICE,
  DecisionModelQuestionType.SCORE,
  DecisionModelQuestionType.NOUL,
];

/**
 * Picks the question type. Each tab is described to assistive technology with
 * what the type does, an example and when to use it.
 */
export function QuestionTypeSelector({
  value,
  onValueChange,
  disabled = false,
}: {
  value: DecisionModelQuestionType;
  onValueChange: (value: DecisionModelQuestionType) => void;
  disabled?: boolean;
}) {
  const helpIdPrefix = useId();

  return (
    <Tabs
      activationMode="manual"
      value={value}
      onValueChange={(next) => onValueChange(next as DecisionModelQuestionType)}
    >
      <Tabs.List variant="inset" size="md" aria-label="Question type">
        {ORDER.map((type) => {
          const copy = QUESTION_TYPE_COPY[type];
          return (
            <Tabs.Trigger
              key={type}
              value={type}
              disabled={disabled}
              aria-describedby={`${helpIdPrefix}-${type}`}
            >
              {copy.label}
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>
      {ORDER.map((type) => {
        const copy = QUESTION_TYPE_COPY[type];
        return (
          <span key={type} id={`${helpIdPrefix}-${type}`} className="sr-only">
            {`${copy.summary} e.g. “${copy.example}” Writes ${copy.writes}. ${copy.whenToUse}`}
          </span>
        );
      })}
    </Tabs>
  );
}
