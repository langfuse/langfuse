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
const WAITING = {
  title: "Waiting for new traces",
  detail:
    "Automatic processing is on. Topics appear once new traces are summarized.",
};
const TOPIC_STEPS = [
  { stage: "grouping", label: "Identifying clusters" },
  { stage: "naming", label: "Generating & refining topics" },
] as const;

/** First-run progress in two phases: summaries, then topics. */
export function TopicSetupProgressView({
  canRetry,
  facets,
  onViewDetails,
  onRetry,
  retrying,
  stage,
  waiting = false,
}: {
  facets: TopicSetupProgressFacet[];
  stage: TopicSetupStage;
  retrying: boolean;
  canRetry: boolean;
  // Opens the run in History; set when a run or one of its facets failed.
  onViewDetails?: () => void;
  onRetry: () => void;
  /** Automatic processing is on but no trace has been summarized yet. */
  waiting?: boolean;
}) {
  const requested = Math.max(0, ...facets.map((facet) => facet.requested));
  const complete = Math.min(
    requested,
    ...facets.map((facet) => facet.complete),
  );
  const summarizing = stage === "summarizing";
  const summariesDone =
    stage === "grouping" || stage === "naming" || stage === "done";
  const percent = summaryPercent(waiting, summariesDone, complete, requested);
  const topicIndex = ["grouping", "naming", "done"].indexOf(stage);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 overflow-y-auto px-4 pt-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <Sparkles aria-hidden="true" size="xl" color="muted" />
        <h2 className="text-2xl font-bold">
          {waiting ? WAITING.title : COPY[stage].title}
        </h2>
        <p className="text-muted-foreground text-sm">
          {progressDetail(stage, canRetry, waiting)}
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
            {summaryCountLabel(summariesDone, waiting, complete, requested)}
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
        </section>
      </div>
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

function summaryPercent(
  waiting: boolean,
  summariesDone: boolean,
  complete: number,
  requested: number,
) {
  if (waiting) return 0;
  if (summariesDone || requested === 0) return 100;
  return Math.round((complete / requested) * 100);
}

function progressDetail(
  stage: TopicSetupStage,
  canRetry: boolean,
  waiting: boolean,
) {
  if (waiting) return WAITING.detail;
  if (stage === "failed" && !canRetry)
    return "Topics could not start. Use Generate topics in the menu.";
  return COPY[stage].detail;
}

function summaryCountLabel(
  summariesDone: boolean,
  waiting: boolean,
  complete: number,
  requested: number,
) {
  if (waiting) return "Waiting for the first traces";
  if (summariesDone)
    return `${requested.toLocaleString("en-US")} traces summarized`;
  return `${complete.toLocaleString("en-US")} of ${requested.toLocaleString("en-US")} traces`;
}

function stepState(index: number, current: number) {
  if (index < current) return "done";
  if (index === current) return "active";
  return "waiting";
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
