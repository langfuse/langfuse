import { DecisionModelQuestionType } from "@langfuse/shared";
import { Gauge, ListChecks, ToggleLeft, type LucideIcon } from "lucide-react";

import { SelectionCardRadioGroup } from "@/src/components/design-system/SelectionCardRadioGroup/SelectionCardRadioGroup";

export const QUESTION_TYPE_COPY: Record<
  DecisionModelQuestionType,
  {
    label: string;
    icon: LucideIcon;
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

const OPTIONS = ORDER.map((type) => ({
  value: type,
  icon: QUESTION_TYPE_COPY[type].icon,
  title: QUESTION_TYPE_COPY[type].label,
  summary: QUESTION_TYPE_COPY[type].summary,
  example: QUESTION_TYPE_COPY[type].example,
}));

/**
 * Picks the question type. All three primitives stay visible with their
 * descriptor so the model's vocabulary is learned where it is used.
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
  const active = QUESTION_TYPE_COPY[value];
  return (
    <div className="@container flex flex-col gap-1.5">
      <SelectionCardRadioGroup
        ariaLabel="Question type"
        columns={3}
        disabled={disabled}
        options={OPTIONS}
        value={value}
        onValueChange={onValueChange}
      />
      <p className="text-muted-foreground text-xs">
        Writes {active.writes}. {active.whenToUse}
      </p>
    </div>
  );
}
