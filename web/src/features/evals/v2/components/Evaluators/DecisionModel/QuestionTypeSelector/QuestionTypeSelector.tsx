import { DecisionModelQuestionType } from "@langfuse/shared";
import {
  Gauge,
  ListChecks,
  ToggleLeft,
  type IconComponent,
} from "@langfuse/icons";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";

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
 * Picks the question type. Each option's info icon says what it does, gives an
 * example and when to use it.
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
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next as DecisionModelQuestionType)}
    >
      <Tabs.List variant="inset" size="md" aria-label="Question type">
        {ORDER.map((type) => {
          const copy = QUESTION_TYPE_COPY[type];
          return (
            <Tabs.Trigger key={type} value={type} disabled={disabled}>
              {copy.label}
              <InfoTooltip label={`About ${copy.label}`}>
                <div className="flex flex-col gap-1.5">
                  <p className="font-bold">{copy.summary}</p>
                  <p className="text-muted-foreground">e.g. “{copy.example}”</p>
                  <p>Writes {copy.writes}.</p>
                  <p>{copy.whenToUse}</p>
                </div>
              </InfoTooltip>
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>
    </Tabs>
  );
}
