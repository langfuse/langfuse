import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { DecisionModelQuestionType } from "@langfuse/shared";
import {
  Gauge,
  ListChecks,
  ToggleLeft,
  type IconComponent,
} from "@langfuse/icons";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useResizeObserver } from "@/src/hooks/useResizeObserver";

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
 * Picks the question type: tabs when they fit the width it is given, a
 * dropdown otherwise. Each type is described to assistive technology with what
 * it does, an example and when to use it.
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

  const slotRef = useRef<HTMLDivElement>(null);
  const tabsMeasureRef = useRef<HTMLDivElement>(null);
  const [tabsFit, setTabsFit] = useState(true);

  const measure = useCallback(() => {
    const slot = slotRef.current;
    const tabsMeasure = tabsMeasureRef.current;
    if (!slot || !tabsMeasure) return;

    setTabsFit(
      tabsMeasure.getBoundingClientRect().width <=
        slot.getBoundingClientRect().width,
    );
  }, []);
  // The first check runs before paint, so a slot too narrow never shows the tabs.
  useLayoutEffect(measure, [measure]);
  useResizeObserver(slotRef, measure);
  // The tabs' own width changes without the slot resizing, e.g. when a font loads.
  useResizeObserver(tabsMeasureRef, measure);

  const tabs = (
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
    </Tabs>
  );

  return (
    <div ref={slotRef} className="flex min-w-0">
      {/* An unseen copy of the tabs stays mounted to read their natural width. */}
      <div
        aria-hidden="true"
        inert
        className="invisible size-0 overflow-hidden"
      >
        <div ref={tabsMeasureRef} className="w-max">
          {tabs}
        </div>
      </div>
      {tabsFit ? (
        tabs
      ) : (
        <div className="w-52 max-w-full">
          <Select
            value={value}
            onValueChange={(next) =>
              onValueChange(next as DecisionModelQuestionType)
            }
            disabled={disabled}
          >
            <SelectTrigger
              aria-label="Question type"
              aria-describedby={`${helpIdPrefix}-${value}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDER.map((type) => (
                <SelectItem
                  key={type}
                  value={type}
                  aria-describedby={`${helpIdPrefix}-${type}`}
                >
                  {QUESTION_TYPE_COPY[type].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {ORDER.map((type) => {
        const copy = QUESTION_TYPE_COPY[type];
        return (
          <span key={type} id={`${helpIdPrefix}-${type}`} className="sr-only">
            {`${copy.summary} e.g. “${copy.example}” Writes ${copy.writes}. ${copy.whenToUse}`}
          </span>
        );
      })}
    </div>
  );
}
