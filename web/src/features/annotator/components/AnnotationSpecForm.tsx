import {
  KeyboardShortcut,
  type KeyboardKey,
} from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/utils/tailwind";
import { Check, Info } from "lucide-react";
import type {
  AnnotationAnswer,
  AnnotationAnswers,
  AnnotationQuestion,
  AnnotationViewSpec,
} from "../types";

type AnnotationSpecFormProps = {
  spec: AnnotationViewSpec;
  answers: AnnotationAnswers;
  onAnswer: (questionId: string, answer: AnnotationAnswer) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function AnnotationSpecForm({
  spec,
  answers,
  onAnswer,
  disabled = false,
  compact = false,
}: AnnotationSpecFormProps) {
  return (
    <div className="ph-no-capture space-y-6">
      {spec.questions.map((question, index) => (
        <QuestionField
          key={question.id}
          question={question}
          number={index + 1}
          value={answers[question.id]}
          onChange={(value) => onAnswer(question.id, value)}
          disabled={disabled}
          compact={compact}
        />
      ))}
    </div>
  );
}

function QuestionField({
  question,
  number,
  value,
  onChange,
  disabled,
  compact,
}: {
  question: AnnotationQuestion;
  number: number;
  value: AnnotationAnswer | undefined;
  onChange: (value: AnnotationAnswer) => void;
  disabled: boolean;
  compact: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="flex w-full items-start gap-2 text-sm">
        <span className="text-foreground-tertiary mt-px tabular-nums">
          {number}.
        </span>
        <span>
          {question.label}
          {question.required ? (
            <span className="text-destructive ml-1" aria-label="required">
              *
            </span>
          ) : null}
        </span>
      </legend>
      {question.helpText && !compact ? (
        <p className="text-foreground-secondary flex items-start gap-1.5 pl-5 text-xs leading-relaxed">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          {question.helpText}
        </p>
      ) : null}
      <div className="pl-5">
        {question.type === "single_choice" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {question.options?.map((option) => {
              const selected = value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(option.value)}
                  className={cn(
                    "bg-background hover:bg-accent flex min-h-10 items-center justify-between rounded-md border px-3 text-left text-sm transition-colors",
                    selected &&
                      "border-primary bg-primary/5 ring-primary/20 ring-2",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full border",
                        selected &&
                          "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {selected ? <Check className="h-3 w-3" /> : null}
                    </span>
                    {option.label}
                  </span>
                  {option.shortcut && !compact ? (
                    <KeyboardShortcut
                      keys={[option.shortcut.toUpperCase() as KeyboardKey]}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {question.type === "boolean" ? (
          <div className="flex gap-2">
            {[true, false].map((option) => (
              <Button
                key={String(option)}
                variant={value === option ? "default" : "outline"}
                onClick={() => onChange(option)}
                className="min-w-20"
                disabled={disabled}
              >
                {option ? "Yes" : "No"}
              </Button>
            ))}
          </div>
        ) : null}

        {question.type === "scale" &&
        question.min !== undefined &&
        question.max !== undefined ? (
          <div className="flex flex-wrap gap-2">
            {Array.from(
              { length: question.max - question.min + 1 },
              (_, index) => question.min! + index,
            ).map((option) => (
              <Button
                key={option}
                variant={value === option ? "default" : "outline"}
                size="icon"
                onClick={() => onChange(option)}
                disabled={disabled}
              >
                {option}
              </Button>
            ))}
          </div>
        ) : null}

        {question.type === "text" ? (
          <Textarea
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            placeholder={question.placeholder}
            rows={compact ? 2 : 3}
            disabled={disabled}
          />
        ) : null}
      </div>
    </fieldset>
  );
}
