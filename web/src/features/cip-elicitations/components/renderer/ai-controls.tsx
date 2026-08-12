// CIP fork feature (see FORK.md): AI-driven answer controls.
//
// Ported concepts from weval-survey-platform's FreeformQuestionSection /
// InterviewerTextInput (AI interviewer loop), ResponseComparisonSection, and
// StimulusRatingSection. The interviewer needs a server round-trip; when no
// `onFollowUp` handler is provided (preview mode, or no LLM connection
// configured) it degrades to a plain textarea.
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/utils/tailwind";
import { Loader2, MessageCircleQuestion } from "lucide-react";
import { useState } from "react";
import {
  type AiInterviewAnswer,
  type AnswerValue,
  type ComparisonAnswer,
  type FormField,
  type StimulusRatingAnswer,
} from "../../lib/contract";
import type { ControlProps } from "./controls";

/**
 * Asks the server for the next interviewer question. Returns `null` when the
 * interview should end (goal reached or budget exhausted).
 */
export type InterviewFollowUpHandler = (args: {
  field: FormField;
  initial: string;
  exchanges: { question: string; answer: string }[];
}) => Promise<string | null>;

export function AiInterviewControl({
  field,
  value,
  onChange,
  disabled,
  onFollowUp,
}: ControlProps & { onFollowUp?: InterviewFollowUpHandler }) {
  const answer: AiInterviewAnswer =
    value && typeof value === "object" && "initial" in value
      ? (value as AiInterviewAnswer)
      : { initial: "", exchanges: [] };
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const maxFollowUps = field.properties?.max_follow_ups ?? 2;
  const canInterview = onFollowUp !== undefined && maxFollowUps > 0;

  const requestFollowUp = async (next: AiInterviewAnswer) => {
    if (!onFollowUp || next.exchanges.length >= maxFollowUps) {
      setDone(true);
      onChange({ ...next, final: latestText(next) });
      return;
    }
    setLoading(true);
    try {
      const question = await onFollowUp({
        field,
        initial: next.initial,
        exchanges: next.exchanges,
      });
      if (question) {
        setPendingQuestion(question);
      } else {
        setDone(true);
        onChange({ ...next, final: latestText(next) });
      }
    } catch {
      // Interviewer unavailable — accept the answer as-is.
      setDone(true);
      onChange({ ...next, final: latestText(next) });
    } finally {
      setLoading(false);
    }
  };

  const submitInitial = async () => {
    const next: AiInterviewAnswer = { ...answer, exchanges: [] };
    onChange(next);
    await requestFollowUp(next);
  };

  const submitFollowUp = async () => {
    if (!pendingQuestion) return;
    const next: AiInterviewAnswer = {
      ...answer,
      exchanges: [
        ...answer.exchanges,
        { question: pendingQuestion, answer: draft },
      ],
    };
    setPendingQuestion(null);
    setDraft("");
    onChange(next);
    await requestFollowUp(next);
  };

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <Textarea
        value={answer.initial}
        onChange={(e) =>
          onChange({
            ...answer,
            initial: e.target.value,
            final: e.target.value,
          })
        }
        placeholder={field.properties?.placeholder ?? "Share your thoughts…"}
        rows={5}
        disabled={disabled || answer.exchanges.length > 0 || done || loading}
      />

      {answer.exchanges.map((exchange, i) => (
        <div key={i} className="flex flex-col gap-2">
          <InterviewerBubble>{exchange.question}</InterviewerBubble>
          <p className="rounded-md bg-muted/50 p-3 text-sm">
            {exchange.answer}
          </p>
        </div>
      ))}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Thinking about a follow-up…
        </div>
      )}

      {pendingQuestion && !loading && (
        <div className="flex flex-col gap-2">
          <InterviewerBubble>{pendingQuestion}</InterviewerBubble>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your answer…"
            rows={3}
            disabled={disabled}
          />
          <Button
            type="button"
            size="sm"
            className="self-start"
            disabled={disabled || draft.trim() === ""}
            onClick={submitFollowUp}
          >
            Send
          </Button>
        </div>
      )}

      {canInterview &&
        !pendingQuestion &&
        !loading &&
        !done &&
        answer.exchanges.length === 0 && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="self-start"
            disabled={disabled || answer.initial.trim() === ""}
            onClick={submitInitial}
          >
            Continue
          </Button>
        )}
    </div>
  );
}

function latestText(answer: AiInterviewAnswer): string {
  const last = answer.exchanges[answer.exchanges.length - 1];
  return last ? last.answer : answer.initial;
}

function InterviewerBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-background p-3 text-sm">
      <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Response comparison — blind side-by-side rating (weval's
// ResponseComparisonSection)
// ---------------------------------------------------------------------------

export function ResponseComparisonControl({
  field,
  value,
  onChange,
  disabled,
}: ControlProps) {
  const stimuli = field.properties?.stimuli ?? [];
  const askPreference = field.properties?.ask_preference ?? false;
  const allowComment = field.properties?.allow_comment ?? false;
  const answer: ComparisonAnswer =
    value && typeof value === "object" && "ratings" in value
      ? (value as ComparisonAnswer)
      : { ratings: {} };

  const setRating = (stimulusId: string, rating: number) =>
    onChange({
      ...answer,
      ratings: { ...answer.ratings, [stimulusId]: rating },
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        {stimuli.map((stimulus, i) => (
          <Card key={stimulus.id} className="flex flex-col gap-3 p-4">
            <span className="text-xs font-medium text-muted-foreground">
              Response {String.fromCharCode(65 + i)}
            </span>
            {stimulus.prompt && (
              <p className="text-xs text-muted-foreground">{stimulus.prompt}</p>
            )}
            <p className="whitespace-pre-wrap text-sm">{stimulus.content}</p>
            <FiveScale
              current={answer.ratings[stimulus.id] ?? 0}
              onSelect={(n) => setRating(stimulus.id, n)}
              disabled={disabled}
            />
          </Card>
        ))}
      </div>

      {askPreference && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Which response do you prefer overall?
          </p>
          <div className="flex flex-wrap gap-2">
            {stimuli.map((stimulus, i) => (
              <Button
                key={stimulus.id}
                type="button"
                size="sm"
                variant={
                  answer.preferred === stimulus.id ? "default" : "outline"
                }
                disabled={disabled}
                onClick={() => onChange({ ...answer, preferred: stimulus.id })}
              >
                Response {String.fromCharCode(65 + i)}
              </Button>
            ))}
          </div>
        </div>
      )}

      {allowComment && (
        <Textarea
          value={answer.comment ?? ""}
          onChange={(e) => onChange({ ...answer, comment: e.target.value })}
          placeholder="Anything you'd like to add? (optional)"
          rows={3}
          disabled={disabled}
          className="max-w-xl"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stimulus rating — rate each stimulus 1–5 with optional comment (weval's
// StimulusRatingSection)
// ---------------------------------------------------------------------------

export function StimulusRatingControl({
  field,
  value,
  onChange,
  disabled,
}: ControlProps) {
  const stimuli = field.properties?.stimuli ?? [];
  const allowComment = field.properties?.allow_comment ?? false;
  const answer: StimulusRatingAnswer =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as StimulusRatingAnswer)
      : {};

  const patch = (
    stimulusId: string,
    entry: Partial<{ rating: number; comment: string }>,
  ) => {
    const current = answer[stimulusId] ?? { rating: 0 };
    onChange({
      ...answer,
      [stimulusId]: { ...current, ...entry },
    } as AnswerValue);
  };

  return (
    <div className="flex max-w-xl flex-col gap-4">
      {stimuli.map((stimulus) => (
        <Card key={stimulus.id} className="flex flex-col gap-3 p-4">
          {stimulus.prompt && (
            <p className="text-xs text-muted-foreground">{stimulus.prompt}</p>
          )}
          <p className="whitespace-pre-wrap text-sm">{stimulus.content}</p>
          <FiveScale
            current={answer[stimulus.id]?.rating ?? 0}
            onSelect={(n) => patch(stimulus.id, { rating: n })}
            disabled={disabled}
          />
          {allowComment && (
            <Textarea
              value={answer[stimulus.id]?.comment ?? ""}
              onChange={(e) => patch(stimulus.id, { comment: e.target.value })}
              placeholder="Comment (optional)"
              rows={2}
              disabled={disabled}
            />
          )}
        </Card>
      ))}
    </div>
  );
}

function FiveScale({
  current,
  onSelect,
  disabled,
}: {
  current: number;
  onSelect: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(n)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-medium transition-colors",
            n === current
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-muted/50",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Crowdpoll embed
// ---------------------------------------------------------------------------

export function CrowdpollControl({ field }: ControlProps) {
  const url = field.properties?.embed_url;
  if (!url) {
    return (
      <div className="flex h-64 max-w-xl items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        No crowdpoll URL configured.
      </div>
    );
  }
  return (
    <iframe
      src={url}
      title={field.title}
      className="h-[32rem] w-full max-w-2xl rounded-md border border-border"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    />
  );
}
