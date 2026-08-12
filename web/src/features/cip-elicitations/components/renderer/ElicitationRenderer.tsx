// CIP fork feature (see FORK.md): the respondent flow — one field per screen
// with progress, back/next, statement read-delays, per-field validation, and a
// closing thank-you screen (heyform's answering UX, our implementation).
//
// Used in three places: the builder's preview modal, the builder canvas (via
// `FieldControl`), and the public /public/forms/[formId] fill page.
import { Button } from "@/src/components/ui/button";
import { Progress } from "@/src/components/ui/progress";
import { cn } from "@/src/utils/tailwind";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  isStatementField,
  validateAnswer,
  type Answer,
  type AnswerValue,
  type FormField,
  type FormSettings,
} from "../../lib/contract";
import {
  AiInterviewControl,
  CrowdpollControl,
  ResponseComparisonControl,
  StimulusRatingControl,
  type InterviewFollowUpHandler,
} from "./ai-controls";
import {
  ChoicesControl,
  DateControl,
  DropdownControl,
  LongTextControl,
  MatrixControl,
  NumberControl,
  OpinionScaleControl,
  RankingControl,
  RatingControl,
  ShortTextControl,
  StatementVotingControl,
  YesNoControl,
} from "./controls";

/** Per-kind control dispatch, shared with the builder canvas. */
export function FieldControl({
  field,
  value,
  onChange,
  disabled,
  onInterviewFollowUp,
}: {
  field: FormField;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  disabled?: boolean;
  onInterviewFollowUp?: InterviewFollowUpHandler;
}) {
  const props = { field, value, onChange, disabled };
  switch (field.kind) {
    case "short_text":
      return <ShortTextControl {...props} />;
    case "long_text":
      return <LongTextControl {...props} />;
    case "number":
      return <NumberControl {...props} />;
    case "date":
      return <DateControl {...props} />;
    case "yes_no":
      return <YesNoControl {...props} />;
    case "multiple_choice":
    case "picture_choice":
      return <ChoicesControl {...props} />;
    case "dropdown":
      return <DropdownControl {...props} />;
    case "rating":
      return <RatingControl {...props} />;
    case "opinion_scale":
      return <OpinionScaleControl {...props} />;
    case "matrix":
      return <MatrixControl {...props} />;
    case "ranking":
      return <RankingControl {...props} />;
    case "statement_voting":
      return <StatementVotingControl {...props} />;
    case "ai_interview":
      return <AiInterviewControl {...props} onFollowUp={onInterviewFollowUp} />;
    case "response_comparison":
      return <ResponseComparisonControl {...props} />;
    case "stimulus_rating":
      return <StimulusRatingControl {...props} />;
    case "crowdpoll":
      return <CrowdpollControl {...props} />;
    default:
      // Statement kinds render no control.
      return null;
  }
}

/** Countdown gate for statement/welcome screens with `min_read_seconds`. */
function useReadDelay(field: FormField | undefined) {
  const delay =
    field && isStatementField(field.kind)
      ? (field.properties?.min_read_seconds ?? 0)
      : 0;
  const [remaining, setRemaining] = useState(delay);
  useEffect(() => {
    setRemaining(delay);
    if (delay <= 0) return;
    const started = Date.now();
    const interval = setInterval(() => {
      const left = delay - Math.floor((Date.now() - started) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0) clearInterval(interval);
    }, 250);
    return () => clearInterval(interval);
  }, [field?.id, delay]);
  return remaining;
}

export function ElicitationRenderer({
  fields,
  settings,
  onSubmit,
  onInterviewFollowUp,
  className,
}: {
  fields: FormField[];
  settings: FormSettings;
  /** Resolves when the submission is stored; rejects to surface an error. */
  onSubmit: (answers: Answer[]) => Promise<void>;
  onInterviewFollowUp?: InterviewFollowUpHandler;
  className?: string;
}) {
  // The walk order: everything except thank-you screens, which close the flow.
  const sequence = useMemo(
    () => fields.filter((f) => f.kind !== "thank_you"),
    [fields],
  );
  const thankYou = useMemo(
    () => fields.find((f) => f.kind === "thank_you"),
    [fields],
  );
  const questionCount = useMemo(
    () => sequence.filter((f) => !isStatementField(f.kind)).length,
    [sequence],
  );

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, AnswerValue>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const field = sequence[index];
  const readDelayRemaining = useReadDelay(field);

  const answeredQuestions = useMemo(
    () =>
      sequence.filter((f, i) => !isStatementField(f.kind) && i < index).length,
    [sequence, index],
  );

  if (sequence.length === 0 && !thankYou) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        This form has no questions yet.
      </div>
    );
  }

  if (submitted || (sequence.length === 0 && thankYou)) {
    return (
      <ScreenFrame className={className}>
        <h2 className="text-2xl font-semibold">
          {thankYou?.title ?? "Thank you!"}
        </h2>
        {thankYou?.description && (
          <p className="mt-2 max-w-xl text-muted-foreground">
            {thankYou.description}
          </p>
        )}
      </ScreenFrame>
    );
  }

  if (!field) return null;

  const next = async () => {
    setError(null);
    if (!isStatementField(field.kind)) {
      const value = answers.get(field.id) ?? null;
      const reason = validateAnswer(field, value);
      if (reason) {
        setError(reason);
        return;
      }
    }
    if (index < sequence.length - 1) {
      setIndex(index + 1);
      return;
    }
    // Last screen — collect all question answers and submit.
    const collected: Answer[] = sequence
      .filter((f) => !isStatementField(f.kind))
      .map((f) => ({
        field_id: f.id,
        kind: f.kind,
        value: answers.get(f.id) ?? null,
      }))
      .filter((a) => a.value !== null);
    setSubmitting(true);
    try {
      await onSubmit(collected);
      setSubmitted(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Submitting failed. Please retry.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const buttonText =
    field.properties?.button_text ??
    (index === sequence.length - 1
      ? "Submit"
      : isStatementField(field.kind)
        ? "Continue"
        : "OK");

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {(settings.show_progress ?? true) && questionCount > 0 && (
        <Progress
          value={(answeredQuestions / questionCount) * 100}
          className="h-1 rounded-none"
        />
      )}
      <ScreenFrame>
        <h2
          className={cn(
            "font-semibold",
            field.kind === "welcome" ? "text-3xl" : "text-xl",
          )}
        >
          {field.title}
          {field.required && <span className="ml-1 text-destructive">*</span>}
        </h2>
        {field.description && (
          <p className="mt-2 max-w-xl whitespace-pre-wrap text-muted-foreground">
            {field.description}
          </p>
        )}
        <div className="mt-6">
          <FieldControl
            field={field}
            value={answers.get(field.id) ?? null}
            onChange={(value) => {
              setError(null);
              setAnswers((prev) => new Map(prev).set(field.id, value));
            }}
            onInterviewFollowUp={onInterviewFollowUp}
          />
        </div>
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        <div className="mt-8 flex items-center gap-2">
          {index > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setError(null);
                setIndex(index - 1);
              }}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          )}
          <Button
            type="button"
            onClick={next}
            disabled={submitting || readDelayRemaining > 0}
          >
            {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {readDelayRemaining > 0
              ? `${buttonText} (${readDelayRemaining})`
              : buttonText}
          </Button>
        </div>
      </ScreenFrame>
    </div>
  );
}

function ScreenFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col justify-center overflow-y-auto px-6 py-10 sm:px-12",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </div>
  );
}
