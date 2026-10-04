import {
  DecisionModelQuestionType,
  type DecisionModelEntry,
  type DecisionModelQuestion,
} from "@langfuse/shared";

import { Badge } from "@/src/components/ui/badge";
import { QUESTION_TYPE_COPY } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/QuestionTypeSelector/QuestionTypeSelector";

function entryText(entry: DecisionModelEntry | null | undefined) {
  if (entry == null) return "";
  return typeof entry === "string" ? entry : JSON.stringify(entry);
}

function Criteria({ question }: { question: DecisionModelQuestion }) {
  switch (question.type) {
    case DecisionModelQuestionType.CHOICE:
      return (
        <ul className="flex flex-col gap-0.5">
          {question.options.map((option) => (
            <li key={option.value} className="flex gap-2">
              <span className="shrink-0 font-mono">{option.value}</span>
              {option.description ? (
                <span className="text-muted-foreground">
                  {entryText(option.description)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      );
    case DecisionModelQuestionType.SCORE:
      return (
        <ol className="flex flex-col gap-0.5">
          {question.levels.map((level, index) => (
            <li key={index} className="flex gap-2">
              <span className="text-muted-foreground shrink-0 font-mono">
                {index}
              </span>
              <span>{entryText(level.description)}</span>
            </li>
          ))}
        </ol>
      );
    case DecisionModelQuestionType.NOUL:
      return question.criteria?.true || question.criteria?.false ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          {question.criteria.true ? (
            <>
              <dt className="text-muted-foreground">Yes</dt>
              <dd>{entryText(question.criteria.true)}</dd>
            </>
          ) : null}
          {question.criteria.false ? (
            <>
              <dt className="text-muted-foreground">No</dt>
              <dd>{entryText(question.criteria.false)}</dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="text-muted-foreground">Returns the probability of yes.</p>
      );
  }
}

/** Read-only rendering of a saved decision-model question. */
export function DecisionModelQuestionSummary({
  question,
  index,
}: {
  question: DecisionModelQuestion;
  index: number;
}) {
  const copy = QUESTION_TYPE_COPY[question.type];
  return (
    <div className="bg-card text-card-foreground flex flex-col gap-2 rounded-md border p-3 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-muted-foreground shrink-0 font-mono text-xs">
          {index + 1}
        </span>
        <copy.icon className="h-4 w-4 shrink-0" aria-label={copy.label} />
        <Badge variant="secondary" className="shrink-0 font-mono">
          {question.scoreName}
        </Badge>
        <span className="truncate" title={entryText(question.instructions)}>
          {entryText(question.instructions)}
        </span>
      </div>
      <div className="pl-6 text-xs">
        <Criteria question={question} />
      </div>
    </div>
  );
}
