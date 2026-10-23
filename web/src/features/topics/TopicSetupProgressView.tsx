/* eslint-disable @typescript-eslint/no-use-before-define */
import { Check, Sparkles } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { Progress } from "@/src/components/design-system/Progress/Progress";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { type TopicSetupStage } from "./topic-setup-flow";

export type TopicSetupProgressFacet = {
  key: string;
  name: string;
  complete: number;
  requested: number;
  outcome: string | null;
  topicCount: number | null;
};

const RUNNING = {
  title: "Analyzing your traces",
  detail: "This runs in the background. You can leave this page.",
};
const COPY: Record<TopicSetupStage, { title: string; detail: string }> = {
  summarizing: RUNNING,
  grouping: RUNNING,
  naming: RUNNING,
  done: {
    title: "Your first topics are ready",
    detail: "Display the results to explore them.",
  },
  failed: {
    title: "The first analysis did not finish",
    detail: "Retry picks up where it stopped.",
  },
};
const TOPIC_STEPS = [
  { stage: "grouping", label: "Identifying clusters" },
  { stage: "naming", label: "Generating & refining topics" },
] as const;
const NO_TOPICS = new Set([
  "no_topics",
  "insufficient_data",
  "no_applicable_summaries",
]);

/** First-run progress in two phases: summaries, then topics. */
export function TopicSetupProgressView({
  canRetry,
  facets,
  onViewDetails,
  onDisplayResults,
  onRetry,
  retrying,
  stage,
}: {
  facets: TopicSetupProgressFacet[];
  stage: TopicSetupStage;
  retrying: boolean;
  canRetry: boolean;
  onDisplayResults: () => void;
  // Opens the run in History; set when a run or one of its facets failed.
  onViewDetails?: () => void;
  onRetry: () => void;
}) {
  const requested = Math.max(0, ...facets.map((facet) => facet.requested));
  const complete = Math.min(
    requested,
    ...facets.map((facet) => facet.complete),
  );
  const summarizing = stage === "summarizing";
  const summariesDone =
    stage === "grouping" || stage === "naming" || stage === "done";
  const percent =
    summariesDone || requested === 0
      ? 100
      : Math.round((complete / requested) * 100);
  const topicIndex = ["grouping", "naming", "done"].indexOf(stage);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 overflow-y-auto px-4 pt-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <Sparkles aria-hidden="true" size="xl" color="muted" />
        <h2 className="text-2xl font-bold">{COPY[stage].title}</h2>
        <p className="text-muted-foreground text-sm">
          {stage === "failed" && !canRetry
            ? "Topics could not start. Use Regenerate topics in the menu."
            : COPY[stage].detail}
        </p>
      </div>
      <div className="grid w-full gap-4 sm:grid-cols-2">
        <section className="bg-card flex flex-col gap-3 rounded-xl border p-5">
          <div className="flex items-center gap-2">
            <PhaseMarker done={summariesDone} active={summarizing} index={1} />
            <h3 className="text-sm font-bold">
              Analyzing traces & generating summaries
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Progress value={percent} />
            </div>
            <span className="text-muted-foreground w-10 text-right font-mono text-xs">
              {percent}%
            </span>
          </div>
          <span className="text-muted-foreground text-xs">
            {summariesDone
              ? `${requested.toLocaleString("en-US")} traces summarized`
              : `${complete.toLocaleString("en-US")} of ${requested.toLocaleString("en-US")} traces`}
          </span>
        </section>
        <section className="bg-card flex flex-col gap-3 rounded-xl border p-5">
          <div className="flex items-center gap-2">
            <PhaseMarker
              done={stage === "done"}
              active={stage === "grouping" || stage === "naming"}
              index={2}
            />
            <h3 className="text-sm font-bold">
              Identifying clusters & generating topics
            </h3>
          </div>
          {topicIndex < 0 ? (
            <span className="text-muted-foreground text-xs">
              Starts when summaries are done.
            </span>
          ) : null}
          {topicIndex >= 0 && stage !== "done" ? (
            <ul className="flex flex-col gap-1.5">
              {TOPIC_STEPS.map((step, index) => (
                <li
                  key={step.stage}
                  className="text-muted-foreground flex items-center gap-2 text-xs"
                >
                  <StepMarker state={stepState(index, topicIndex)} />
                  {step.label}
                </li>
              ))}
            </ul>
          ) : null}
          {stage === "done" ? (
            <ul className="flex flex-col gap-1.5">
              {facets.map((facet) => (
                <li
                  key={facet.key}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span>{facet.name}</span>
                  <span className="text-muted-foreground">
                    {facetResult(facet)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
      {stage === "done" ? (
        <Button text="Display results" onClick={onDisplayResults} />
      ) : null}
      {stage === "failed" && canRetry ? (
        <Button text="Retry" loading={retrying} onClick={onRetry} />
      ) : null}
      {onViewDetails ? (
        <Button
          text="See run details"
          variant="ghost"
          onClick={onViewDetails}
        />
      ) : null}
    </div>
  );
}

function stepState(index: number, current: number) {
  if (index < current) return "done";
  if (index === current) return "active";
  return "waiting";
}

function facetResult(facet: TopicSetupProgressFacet) {
  if (facet.outcome === "failed") return "Failed";
  if (NO_TOPICS.has(facet.outcome ?? "")) return "Not enough data yet";
  if (facet.topicCount === null) return "Topics ready";
  return `${facet.topicCount} ${facet.topicCount === 1 ? "topic" : "topics"}`;
}

function PhaseMarker({
  active,
  done,
  index,
}: {
  active: boolean;
  done: boolean;
  index: number;
}) {
  if (done)
    return (
      <span className="bg-dark-green flex size-5 shrink-0 items-center justify-center rounded-full text-white">
        <Check size="sm" aria-hidden="true" />
      </span>
    );
  if (active) return <Spinner size="sm" />;
  return (
    <span className="text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-full border text-xs">
      {index}
    </span>
  );
}

function StepMarker({ state }: { state: "done" | "active" | "waiting" }) {
  if (state === "done") return <Check size="sm" aria-hidden="true" />;
  if (state === "active") return <Spinner size="xxs" />;
  return <span className="size-3 rounded-full border" />;
}
