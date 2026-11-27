import { useId } from "react";
import { DecisionModelQuestionType } from "@langfuse/shared";
import {
  Gauge,
  Info,
  ListChecks,
  ToggleLeft,
  type IconComponent,
} from "@langfuse/icons";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";

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
  const helpIdPrefix = useId();

  return (
    <div className="@container flex flex-col gap-1.5">
      <div
        role="radiogroup"
        aria-label="Question type"
        className="grid gap-2 @lg:grid-cols-3"
      >
        {ORDER.map((type) => {
          const copy = QUESTION_TYPE_COPY[type];
          const selected = type === value;
          const helpId = `${helpIdPrefix}-${type}`;
          const explanation = `Writes ${copy.writes}. ${copy.whenToUse}`;
          return (
            <div
              key={type}
              className={cn(
                "relative rounded-md border text-sm transition-colors",
                "hover:bg-muted/50",
                selected
                  ? "border-primary-accent bg-primary-accent/5 ring-primary-accent ring-1"
                  : "border-border",
                disabled && "opacity-60",
              )}
            >
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                aria-describedby={helpId}
                disabled={disabled}
                onClick={() => onValueChange(type)}
                className={cn(
                  "flex w-full flex-col gap-1 p-3 pr-10 text-left",
                  "focus-visible:ring-ring rounded-md focus-visible:ring-2 focus-visible:outline-hidden",
                  disabled && "cursor-not-allowed",
                )}
              >
                <span className="flex items-center gap-1.5 font-bold">
                  <copy.icon size="base" />
                  {copy.label}
                </span>
                <span className="text-muted-foreground">{copy.summary}</span>
                <span className="text-muted-foreground text-xs italic">
                  e.g. “{copy.example}”
                </span>
              </button>
              <div className="absolute top-2 right-1.5">
                <Tooltip label={explanation}>
                  {({ getTriggerProps }) => (
                    <IconButton
                      {...getTriggerProps()}
                      icon={Info}
                      label={`About ${copy.label}`}
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                    />
                  )}
                </Tooltip>
              </div>
              <span id={helpId} className="sr-only">
                {explanation}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
