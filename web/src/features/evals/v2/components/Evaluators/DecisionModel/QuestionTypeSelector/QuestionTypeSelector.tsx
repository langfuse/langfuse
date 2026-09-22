import { DecisionModelQuestionType } from "@langfuse/shared";
import { Gauge, ListChecks, ToggleLeft, type LucideIcon } from "lucide-react";

import { cn } from "@/src/utils/tailwind";

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
    <div className="flex flex-col gap-1.5">
      <div
        role="radiogroup"
        aria-label="Question type"
        className="grid gap-2 sm:grid-cols-3"
      >
        {ORDER.map((type) => {
          const copy = QUESTION_TYPE_COPY[type];
          const selected = type === value;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onValueChange(type)}
              className={cn(
                "flex flex-col gap-1 rounded-md border p-3 text-left text-sm transition-colors",
                "hover:bg-muted/50 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
                selected
                  ? "border-primary-accent bg-primary-accent/5 ring-primary-accent ring-1"
                  : "border-border",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <span className="flex items-center gap-1.5 font-bold">
                <copy.icon className="h-4 w-4 shrink-0" />
                {copy.label}
              </span>
              <span className="text-muted-foreground">{copy.summary}</span>
              <span className="text-muted-foreground text-xs italic">
                e.g. “{copy.example}”
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        Writes {active.writes}. {active.whenToUse}
      </p>
    </div>
  );
}
