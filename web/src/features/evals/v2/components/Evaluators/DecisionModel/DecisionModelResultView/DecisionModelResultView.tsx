import { Badge } from "@/src/components/ui/badge";
import { QUESTION_TYPE_COPY } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/QuestionTypeSelector/QuestionTypeSelector";
import { cn } from "@/src/utils/tailwind";

export type DecisionModelQuestionResult = {
  questionId: string;
  scoreName: string;
  instructions: string;
} & (
  | {
      type: "choice";
      choice: string;
      probabilities: Record<string, number>;
      confidence: number | null;
    }
  | {
      type: "score";
      score: number;
      levels: string[];
      probabilities: Record<string, number>;
      confidence: number | null;
    }
  | { type: "noul"; probability: number }
);

const percent = (value: number) => `${Math.round(value * 100)}%`;

function ConfidenceBadge({ confidence }: { confidence: number }) {
  return (
    <span
      className="text-muted-foreground shrink-0 font-mono text-xs"
      title="How concentrated the distribution is (0–1). Not the winner's probability."
    >
      confidence {confidence.toFixed(2)}
    </span>
  );
}

function ProbabilityBars({
  entries,
  highlight,
}: {
  entries: Array<{ label: string; value: number }>;
  highlight: string;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {entries.map(({ label, value }) => {
        const winner = label === highlight;
        return (
          <li
            key={label}
            className="grid grid-cols-[minmax(6rem,1fr)_3fr_3rem] items-center gap-2 text-xs"
          >
            <span
              className={cn(
                "truncate font-mono",
                winner ? "font-bold" : "text-muted-foreground",
              )}
              title={label}
            >
              {label}
            </span>
            <span className="bg-muted h-2 overflow-hidden rounded-full">
              <span
                className={cn(
                  "block h-full rounded-full",
                  winner ? "bg-primary-accent" : "bg-muted-foreground/40",
                )}
                style={{ width: percent(value) }}
              />
            </span>
            <span
              className={cn(
                "text-right font-mono",
                winner ? "" : "text-muted-foreground",
              )}
            >
              {percent(value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function NoulGauge({ probability }: { probability: number }) {
  const leaning = probability >= 0.5 ? "yes" : "no";
  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex items-center justify-between font-mono">
        <span
          className={leaning === "no" ? "font-bold" : "text-muted-foreground"}
        >
          no
        </span>
        <span
          className={leaning === "yes" ? "font-bold" : "text-muted-foreground"}
        >
          yes
        </span>
      </div>
      <div className="bg-muted relative h-2 rounded-full">
        <span
          className="bg-primary-accent absolute inset-y-0 left-0 rounded-full"
          style={{ width: percent(probability) }}
        />
        <span
          className="bg-muted-foreground/40 absolute inset-y-[-3px] left-1/2 w-px"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function resultValue(result: DecisionModelQuestionResult) {
  switch (result.type) {
    case "choice":
      return result.choice;
    case "score": {
      const nearest = Math.min(
        Math.max(Math.round(result.score), 0),
        Math.max(result.levels.length - 1, 0),
      );
      return result.levels[nearest] || String(nearest);
    }
    case "noul":
      return result.probability >= 0.5 ? "yes" : "no";
  }
}

function ResultBadge({ result }: { result: DecisionModelQuestionResult }) {
  return (
    <Badge className="shrink-0 font-mono">
      {result.type === "noul"
        ? `${percent(Math.max(result.probability, 1 - result.probability))} `
        : null}
      {resultValue(result)}
    </Badge>
  );
}

function ResultVisual({ result }: { result: DecisionModelQuestionResult }) {
  switch (result.type) {
    case "choice":
      return (
        <ProbabilityBars
          entries={Object.entries(result.probabilities)
            .sort(([, a], [, b]) => b - a)
            .map(([label, value]) => ({ label, value }))}
          highlight={result.choice}
        />
      );
    case "score": {
      const nearest = Math.min(
        Math.max(Math.round(result.score), 0),
        Math.max(result.levels.length - 1, 0),
      );
      return (
        <ProbabilityBars
          entries={result.levels
            .map((description, index) => ({
              label: description || String(index),
              value: result.probabilities[String(index)] ?? 0,
            }))
            .sort((left, right) => right.value - left.value)}
          highlight={result.levels[nearest] || String(nearest)}
        />
      );
    }
    case "noul":
      return <NoulGauge probability={result.probability} />;
  }
}

function ResultRow({ result }: { result: DecisionModelQuestionResult }) {
  const copy = QUESTION_TYPE_COPY[result.type];
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary" className="min-w-0 font-mono">
          <copy.icon className="icon-base shrink-0" aria-label={copy.label} />
          <span className="truncate" title={result.scoreName}>
            {result.scoreName}
          </span>
        </Badge>
        {result.type !== "noul" && result.confidence !== null ? (
          <ConfidenceBadge confidence={result.confidence} />
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span
          className="text-muted-foreground min-w-0 truncate"
          title={result.instructions}
        >
          {result.instructions}
        </span>
        <div
          className="border-border min-w-4 flex-1 border-t border-dashed"
          aria-hidden="true"
        />
        <ResultBadge result={result} />
      </div>
      <ResultVisual result={result} />
    </li>
  );
}

/**
 * Test result of a decision-model evaluator: one row per question with the
 * full probability distribution, since the model returns no rationale.
 */
export function DecisionModelResultView({
  results,
}: {
  results: DecisionModelQuestionResult[];
}) {
  return (
    <ul className="flex flex-col gap-2">
      {results.map((result) => (
        <ResultRow key={result.questionId} result={result} />
      ))}
    </ul>
  );
}
