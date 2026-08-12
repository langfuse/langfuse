// CIP fork feature (see FORK.md): per-kind answer controls.
//
// Interaction patterns are ported from weval-survey-platform's poll widgets,
// LikertScale, and general-interview sections (question sets, matrix, ranking,
// statement voting), restyled onto the fork's shadcn primitives. Each control
// is a pure value/onChange component so the builder canvas, the preview modal,
// and the public fill page can all reuse it.
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/utils/tailwind";
import { Heart, Star } from "lucide-react";
import { useMemo, useState } from "react";
import {
  NONE_CHOICE_ID,
  STATEMENT_VOTE_VALUES,
  type AnswerValue,
  type FormField,
  type StatementVote,
} from "../../lib/contract";

export type ControlProps = {
  field: FormField;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  disabled?: boolean;
};

const OTHER_SENTINEL = "__other_pending__";

/** Fisher–Yates with a per-mount seed so the order is stable while answering. */
function useMaybeShuffled<T>(items: T[], randomize: boolean): T[] {
  const [seed] = useState(() => Math.random());
  return useMemo(() => {
    if (!randomize) return items;
    const shuffled = [...items];
    let s = Math.floor(seed * 2 ** 31);
    for (let i = shuffled.length - 1; i > 0; i--) {
      s = (s * 48271) % 2147483647;
      const j = s % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
  }, [items, randomize, seed]);
}

// ---------------------------------------------------------------------------
// Text / number / date
// ---------------------------------------------------------------------------

export function ShortTextControl({
  field,
  value,
  onChange,
  disabled,
}: ControlProps) {
  return (
    <Input
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.properties?.placeholder ?? "Type your answer here…"}
      disabled={disabled}
      className="max-w-xl"
    />
  );
}

export function LongTextControl({
  field,
  value,
  onChange,
  disabled,
}: ControlProps) {
  return (
    <Textarea
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.properties?.placeholder ?? "Type your answer here…"}
      disabled={disabled}
      rows={5}
      className="max-w-xl"
    />
  );
}

export function NumberControl({
  field,
  value,
  onChange,
  disabled,
}: ControlProps) {
  return (
    <Input
      type="number"
      value={typeof value === "number" ? value : ""}
      onChange={(e) =>
        onChange(e.target.value === "" ? null : Number(e.target.value))
      }
      placeholder={field.properties?.placeholder ?? "0"}
      min={field.properties?.min_value}
      max={field.properties?.max_value}
      disabled={disabled}
      className="max-w-48"
    />
  );
}

export function DateControl({ value, onChange, disabled }: ControlProps) {
  return (
    <Input
      type="date"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="max-w-48"
    />
  );
}

// ---------------------------------------------------------------------------
// Choices (multiple choice / picture choice / dropdown / yes-no)
// ---------------------------------------------------------------------------

export function YesNoControl({ value, onChange, disabled }: ControlProps) {
  return (
    <div className="flex gap-3">
      {[
        { label: "Yes", val: true },
        { label: "No", val: false },
      ].map(({ label, val }) => (
        <Button
          key={label}
          type="button"
          variant={value === val ? "default" : "outline"}
          disabled={disabled}
          onClick={() => onChange(val)}
          className="min-w-24"
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Weval's SingleSelectPoll / QuestionSet select, extended with heyform-style
 * "Other" write-in and an exclusive "None of the above" option.
 */
export function ChoicesControl({
  field,
  value,
  onChange,
  disabled,
}: ControlProps) {
  const orderedChoices = useMemo(
    () => field.properties?.choices ?? [],
    [field.properties?.choices],
  );
  const choices = useMaybeShuffled(
    orderedChoices,
    field.properties?.randomize ?? false,
  );
  const allowMultiple = field.properties?.allow_multiple ?? false;
  const allowOther = field.properties?.allow_other ?? false;
  const allowNone = field.properties?.allow_none ?? false;
  const isPicture = field.kind === "picture_choice";

  const selected = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const choiceIds = useMemo(() => new Set(choices.map((c) => c.id)), [choices]);
  const otherValue = selected.find(
    (v) => v !== NONE_CHOICE_ID && !choiceIds.has(v),
  );
  const [otherDraft, setOtherDraft] = useState(
    otherValue && otherValue !== OTHER_SENTINEL ? otherValue : "",
  );

  const toggle = (id: string) => {
    if (id === NONE_CHOICE_ID) {
      onChange(selected.includes(NONE_CHOICE_ID) ? [] : [NONE_CHOICE_ID]);
      return;
    }
    const withoutNone = selected.filter((v) => v !== NONE_CHOICE_ID);
    if (allowMultiple) {
      onChange(
        withoutNone.includes(id)
          ? withoutNone.filter((v) => v !== id)
          : [...withoutNone, id],
      );
    } else {
      // Keep an existing other write-in only when toggling it explicitly.
      onChange(selected.includes(id) && selected.length === 1 ? [] : [id]);
    }
  };

  const setOther = (text: string) => {
    setOtherDraft(text);
    const withoutOther = selected.filter(
      (v) => v === NONE_CHOICE_ID || choiceIds.has(v),
    );
    const base = allowMultiple
      ? withoutOther.filter((v) => v !== NONE_CHOICE_ID)
      : [];
    onChange(text.trim() === "" ? base : [...base, text]);
  };

  const otherActive = otherValue !== undefined;

  return (
    <div
      className={cn(
        "flex max-w-xl flex-col gap-2",
        isPicture && "grid grid-cols-2 gap-3 sm:grid-cols-3",
      )}
    >
      {choices.map((choice) => {
        const active = selected.includes(choice.id);
        return (
          <button
            key={choice.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(choice.id)}
            className={cn(
              "flex items-center gap-3 rounded-md border p-3 text-left text-sm transition-colors",
              active
                ? "border-primary bg-primary/10"
                : "border-border hover:bg-muted/50",
              isPicture && "flex-col items-stretch",
            )}
          >
            {isPicture && (
              <div className="flex h-24 items-center justify-center overflow-hidden rounded bg-muted">
                {choice.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={choice.image_url}
                    alt={choice.label}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No image
                  </span>
                )}
              </div>
            )}
            <span className="flex items-center gap-3">
              {allowMultiple ? (
                <Checkbox checked={active} className="pointer-events-none" />
              ) : (
                <span
                  className={cn(
                    "h-4 w-4 shrink-0 rounded-full border",
                    active ? "border-4 border-primary" : "border-border",
                  )}
                />
              )}
              {choice.label || "Untitled option"}
            </span>
          </button>
        );
      })}

      {allowOther && (
        <div
          className={cn(
            "flex items-center gap-3 rounded-md border p-3",
            otherActive ? "border-primary bg-primary/10" : "border-border",
          )}
        >
          <span className="text-sm text-muted-foreground">Other:</span>
          <Input
            value={otherDraft}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Type your own answer"
            disabled={disabled}
            className="h-8 flex-1 border-none bg-transparent shadow-none focus-visible:ring-0"
          />
        </div>
      )}

      {allowNone && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => toggle(NONE_CHOICE_ID)}
          className={cn(
            "flex items-center gap-3 rounded-md border p-3 text-left text-sm",
            selected.includes(NONE_CHOICE_ID)
              ? "border-primary bg-primary/10"
              : "border-border hover:bg-muted/50",
          )}
        >
          <span
            className={cn(
              "h-4 w-4 shrink-0 rounded-full border",
              selected.includes(NONE_CHOICE_ID)
                ? "border-4 border-primary"
                : "border-border",
            )}
          />
          None of the above
        </button>
      )}
    </div>
  );
}

/** Weval's DropdownPoll on the fork's Select. */
export function DropdownControl({
  field,
  value,
  onChange,
  disabled,
}: ControlProps) {
  const orderedChoices = useMemo(
    () => field.properties?.choices ?? [],
    [field.properties?.choices],
  );
  const choices = useMaybeShuffled(
    orderedChoices,
    field.properties?.randomize ?? false,
  );
  const selected = Array.isArray(value) ? value[0] : undefined;
  return (
    <Select
      value={selected ?? ""}
      onValueChange={(v) => onChange([v])}
      disabled={disabled}
    >
      <SelectTrigger className="max-w-xl">
        <SelectValue placeholder="Select an option…" />
      </SelectTrigger>
      <SelectContent>
        {choices.map((choice) => (
          <SelectItem key={choice.id} value={choice.id}>
            {choice.label || "Untitled option"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Scales (rating / opinion scale) — weval's LikertScale generalized
// ---------------------------------------------------------------------------

export function RatingControl({
  field,
  value,
  onChange,
  disabled,
}: ControlProps) {
  const max = field.properties?.rating_max ?? 5;
  const shape = field.properties?.rating_shape ?? "star";
  const current = typeof value === "number" ? value : 0;
  const Icon = shape === "heart" ? Heart : Star;

  if (shape === "number") {
    return (
      <ScaleRow
        max={max}
        current={current}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          aria-label={`${n} of ${max}`}
          className="p-1"
        >
          <Icon
            className={cn(
              "h-7 w-7 transition-colors",
              n <= current
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground/40",
            )}
          />
        </button>
      ))}
    </div>
  );
}

function ScaleRow({
  max,
  current,
  onChange,
  disabled,
}: {
  max: number;
  current: number;
  onChange: (value: AnswerValue) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-medium transition-colors",
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

export function OpinionScaleControl({
  field,
  value,
  onChange,
  disabled,
}: ControlProps) {
  const max = field.properties?.rating_max ?? 5;
  const current = typeof value === "number" ? value : 0;
  return (
    <div className="max-w-xl">
      <ScaleRow
        max={max}
        current={current}
        onChange={onChange}
        disabled={disabled}
      />
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{field.properties?.left_label ?? ""}</span>
        <span>{field.properties?.center_label ?? ""}</span>
        <span>{field.properties?.right_label ?? ""}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grids — weval's MatrixQuestionSection / StatementVotingSection /
// RankingQuestionSection
// ---------------------------------------------------------------------------

export function MatrixControl({
  field,
  value,
  onChange,
  disabled,
}: ControlProps) {
  const rows = field.properties?.rows ?? [];
  const columns = field.properties?.columns ?? [];
  const answers: Record<string, string> =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, string>)
      : {};

  const set = (rowId: string, colId: string) =>
    onChange({ ...answers, [rowId]: colId });

  return (
    <div className="overflow-x-auto">
      <table className="w-full max-w-2xl border-collapse text-sm">
        <thead>
          <tr>
            <th className="p-2" />
            {columns.map((col) => (
              <th
                key={col.id}
                className="p-2 text-center font-normal text-muted-foreground"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border">
              <td className="p-2 pr-4">{row.label}</td>
              {columns.map((col) => (
                <td key={col.id} className="p-2 text-center">
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`${row.label}: ${col.label}`}
                    onClick={() => set(row.id, col.id)}
                    className={cn(
                      "h-5 w-5 rounded-full border align-middle",
                      answers[row.id] === col.id
                        ? "border-4 border-primary"
                        : "border-border hover:border-primary/50",
                    )}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Click-to-rank, like weval's RankingQuestionSection (no drag needed). */
export function RankingControl({
  field,
  value,
  onChange,
  disabled,
}: ControlProps) {
  const choices = field.properties?.choices ?? [];
  const ranked = Array.isArray(value) ? value : [];

  const toggle = (id: string) => {
    onChange(
      ranked.includes(id) ? ranked.filter((v) => v !== id) : [...ranked, id],
    );
  };

  return (
    <div className="flex max-w-xl flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Click options in order of preference. Click again to remove.
      </p>
      {choices.map((choice) => {
        const rank = ranked.indexOf(choice.id);
        return (
          <button
            key={choice.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(choice.id)}
            className={cn(
              "flex items-center gap-3 rounded-md border p-3 text-left text-sm transition-colors",
              rank >= 0
                ? "border-primary bg-primary/10"
                : "border-border hover:bg-muted/50",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                rank >= 0
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground",
              )}
            >
              {rank >= 0 ? rank + 1 : ""}
            </span>
            {choice.label || "Untitled option"}
          </button>
        );
      })}
    </div>
  );
}

export function StatementVotingControl({
  field,
  value,
  onChange,
  disabled,
}: ControlProps) {
  const statements = field.properties?.statements ?? [];
  const votes: Record<string, string> =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, string>)
      : {};
  const labels: Record<StatementVote, string> = {
    agree: field.properties?.agree_label ?? "Agree",
    disagree: field.properties?.disagree_label ?? "Disagree",
    unsure: field.properties?.unsure_label ?? "Unsure",
  };

  return (
    <div className="flex max-w-xl flex-col gap-4">
      {statements.map((statement) => (
        <div key={statement.id} className="rounded-md border border-border p-4">
          <p className="mb-3 text-sm">{statement.label}</p>
          <div className="flex gap-2">
            {STATEMENT_VOTE_VALUES.map((vote) => (
              <Button
                key={vote}
                type="button"
                size="sm"
                variant={votes[statement.id] === vote ? "default" : "outline"}
                disabled={disabled}
                onClick={() => onChange({ ...votes, [statement.id]: vote })}
              >
                {labels[vote]}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
