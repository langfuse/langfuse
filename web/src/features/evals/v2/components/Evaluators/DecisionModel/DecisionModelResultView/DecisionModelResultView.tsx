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

function confidenceTone(confidence: number) {
  if (confidence >= 0.8) return "text-dark-green";
  if (confidence >= 0.5) return "text-dark-yellow";
  return "text-destructive";
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  return (
    <span
      className={cn("font-mono text-xs", confidenceTone(confidence))}
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

function ScoreDistribution({
  score,
  levels,
  probabilities,
}: {
  score: number;
  levels: string[];
  probabilities: Record<string, number>;
}) {
  const top = Math.max(levels.length - 1, 1);
  const nearest = Math.min(Math.max(Math.round(score), 0), levels.length - 1);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative pt-4">
        <div className="bg-muted h-2 rounded-full" />
        <span
          className="bg-primary-accent absolute top-3 h-4 w-0.5 -translate-x-1/2 rounded"
          style={{ left: `${(score / top) * 100}%` }}
          aria-hidden="true"
        />
        <span
          className="text-primary-accent absolute top-0 -translate-x-1/2 font-mono text-xs font-bold"
          style={{ left: `${(score / top) * 100}%` }}
        >
          {score.toFixed(2)}
        </span>
      </div>
      <ol
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))`,
        }}
      >
        {levels.map((description, index) => (
          <li
            key={index}
            className={cn(
              "flex flex-col gap-0.5 text-xs",
              index === nearest ? "" : "text-muted-foreground",
            )}
          >
            <span className="font-mono">
              {index} · {percent(probabilities[String(index)] ?? 0)}
            </span>
            <span className="line-clamp-2" title={description}>
              {description}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function NoulGauge({ probability }: { probability: number }) {
  const leaning = probability >= 0.5 ? "yes" : "no";
  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex items-center justify-between font-mono">
        <span className="text-muted-foreground">no</span>
        <span className="font-bold">
          P(yes) = {probability.toFixed(2)} → leaning {leaning}
        </span>
        <span className="text-muted-foreground">yes</span>
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
    case "score":
      return result.score.toFixed(2);
    case "noul":
      return result.probability.toFixed(2);
  }
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
    case "score":
      return (
        <ScoreDistribution
          score={result.score}
          levels={result.levels}
          probabilities={result.probabilities}
        />
      );
    case "noul":
      return <NoulGauge probability={result.probability} />;
  }
}

function ResultRow({ result }: { result: DecisionModelQuestionResult }) {
  const copy = QUESTION_TYPE_COPY[result.type];
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <copy.icon className="h-4 w-4 shrink-0" aria-label={copy.label} />
          <Badge variant="secondary" className="font-mono">
            {result.scoreName}
          </Badge>
          <span
            className="text-muted-foreground truncate"
            title={result.instructions}
          >
            {result.instructions}
          </span>
        </span>
        <span className="flex items-center gap-3">
          {result.type !== "noul" && result.confidence !== null ? (
            <ConfidenceBadge confidence={result.confidence} />
          ) : null}
          <Badge className="font-mono">{resultValue(result)}</Badge>
        </span>
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
