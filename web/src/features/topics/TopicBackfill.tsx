import { useState } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { Input } from "@/src/components/design-system/Input/Input";
import { RadioGroup } from "@/src/components/design-system/RadioGroup/RadioGroup";
import { api } from "@/src/utils/api";
import {
  TOPIC_BACKFILL_MAX_TRACES,
  TOPIC_BACKFILL_WINDOW_DAYS,
  type TopicBackfillSource,
} from "@langfuse/shared/topics";

const SOURCES: Array<{
  value: TopicBackfillSource;
  label: string;
  hint: string;
}> = [
  {
    value: "ready",
    label: "Latest ready traces",
    hint: "The newest traces that are idle and not yet summarized for the selected insights.",
  },
  {
    value: "random",
    label: `Random traces from the last ${TOPIC_BACKFILL_WINDOW_DAYS} days`,
    hint: "A random sample, including traces that already have summaries.",
  },
];

export type TopicBackfillResult =
  | { status: "scheduled"; traceCount: number }
  | { status: "error"; message: string };

/**
 * Runs the saved setup on past traces through the same trace batches as
 * automatic processing. Lives inside the Configure Topics form, so its
 * controls never submit that form.
 */
export function TopicBackfillSection({
  disabledReason,
  pending,
  result,
  onBackfill,
}: {
  /** Why the section cannot run now; null when it can. */
  disabledReason: string | null;
  pending: boolean;
  result: TopicBackfillResult | null;
  onBackfill: (source: TopicBackfillSource, limit: number) => void;
}) {
  const [source, setSource] = useState<TopicBackfillSource>("ready");
  const [count, setCount] = useState(String(TOPIC_BACKFILL_MAX_TRACES));
  const limit = Number(count);
  const validCount =
    Number.isInteger(limit) && limit >= 1 && limit <= TOPIC_BACKFILL_MAX_TRACES;
  const disabled = disabledReason !== null;

  return (
    <div className="flex flex-col gap-3">
      <RadioGroup
        value={source}
        onValueChange={(value) => setSource(value as TopicBackfillSource)}
      >
        {SOURCES.map((option) => (
          <label
            key={option.value}
            htmlFor={`topic-backfill-${option.value}`}
            className="flex items-start gap-2 text-sm"
          >
            <span className="mt-0.5">
              <RadioGroup.Item
                id={`topic-backfill-${option.value}`}
                value={option.value}
                disabled={disabled}
              />
            </span>
            <span className="flex flex-col">
              <span className="font-bold">{option.label}</span>
              <span className="text-muted-foreground text-xs">
                {option.hint}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-24">
          <Input
            aria-label="Number of traces to backfill"
            type="number"
            inputMode="numeric"
            min={1}
            value={count}
            error={!validCount}
            disabled={disabled}
            onChange={(event) => setCount(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
          />
        </div>
        <p className="text-muted-foreground text-sm">
          traces, up to {TOPIC_BACKFILL_MAX_TRACES}.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          text="Backfill traces"
          loading={pending}
          disabled={disabled || pending || !validCount}
          onClick={() => onBackfill(source, limit)}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {backfillStatus({ disabledReason, validCount, result })}
      </p>
    </div>
  );
}

function backfillStatus({
  disabledReason,
  validCount,
  result,
}: {
  disabledReason: string | null;
  validCount: boolean;
  result: TopicBackfillResult | null;
}) {
  if (disabledReason) return disabledReason;
  if (!validCount)
    return `Choose between 1 and ${TOPIC_BACKFILL_MAX_TRACES} traces.`;
  if (result?.status === "error") return result.message;
  if (result?.status === "scheduled")
    return result.traceCount === 0
      ? "No traces matched. Nothing was scheduled."
      : `Scheduled ${result.traceCount} ${result.traceCount === 1 ? "trace" : "traces"}. Summaries appear once their batches finish.`;
  return "Uses the saved models, insights, and sampling rate. Save changes first.";
}

export function ProjectTopicBackfill({
  projectId,
  disabledReason,
}: {
  projectId: string;
  disabledReason: string | null;
}) {
  const [result, setResult] = useState<TopicBackfillResult | null>(null);
  const backfill = api.topics.backfill.useMutation({
    onSuccess: ({ traceCount }) =>
      setResult({ status: "scheduled", traceCount }),
    onError: (error) => setResult({ status: "error", message: error.message }),
  });
  return (
    <TopicBackfillSection
      disabledReason={disabledReason}
      pending={backfill.isPending}
      result={result}
      onBackfill={(source, limit) => {
        setResult(null);
        backfill.mutate({ projectId, source, limit });
      }}
    />
  );
}
