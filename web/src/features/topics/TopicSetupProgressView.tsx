import { Check } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
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

const FILLS = [
  "bg-dark-violet/25",
  "bg-dark-blue/20",
  "bg-dark-teal/20",
  "bg-dark-yellow/25",
];
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
const NO_TOPICS = new Set([
  "no_topics",
  "insufficient_data",
  "no_applicable_summaries",
]);

/** First-run progress: summaries fill one bucket per facet, then topics are grouped and named. */
export function TopicSetupProgressView({
  facets,
  onDisplayResults,
  onRetry,
  retrying,
  canRetry,
  stage,
}: {
  facets: TopicSetupProgressFacet[];
  stage: TopicSetupStage;
  retrying: boolean;
  canRetry: boolean;
  onDisplayResults: () => void;
  onRetry: () => void;
}) {
  const anyWithoutTopics =
    stage === "done" &&
    facets.some((facet) => NO_TOPICS.has(facet.outcome ?? ""));
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 overflow-y-auto px-4 pt-12">
      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="text-2xl font-bold">{COPY[stage].title}</h2>
        <p className="text-muted-foreground text-sm">
          {stage === "failed" && !canRetry
            ? "Topics could not start. Use Generate topics in the menu."
            : COPY[stage].detail}
        </p>
      </div>
      <div className="bg-light-violet grid w-full grid-cols-2 gap-6 rounded-2xl px-6 py-8 sm:grid-cols-4">
        {facets.map((facet, index) => (
          <FacetBucket
            key={facet.key}
            facet={facet}
            fill={FILLS[index % FILLS.length]!}
            stage={stage}
          />
        ))}
      </div>
      {anyWithoutTopics ? (
        <p className="text-muted-foreground text-center text-sm">
          Facets without enough data get topics as more traces come in.
        </p>
      ) : null}
      {stage === "done" ? (
        <Button text="Display results" onClick={onDisplayResults} />
      ) : null}
      {stage === "failed" && canRetry ? (
        <Button text="Retry" loading={retrying} onClick={onRetry} />
      ) : null}
    </div>
  );
}

function FacetBucket({
  facet,
  fill,
  stage,
}: {
  facet: TopicSetupProgressFacet;
  fill: string;
  stage: TopicSetupStage;
}) {
  const percent =
    facet.requested > 0
      ? Math.min(100, Math.round((facet.complete / facet.requested) * 100))
      : 0;
  const summarized = stage !== "summarizing" && stage !== "failed";
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        role="progressbar"
        aria-label={`${facet.name} summaries`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="bg-card relative h-36 w-full max-w-28 overflow-hidden rounded-b-2xl border-2 border-t-0"
      >
        <div
          className={`absolute inset-x-0 bottom-0 transition-[height] duration-700 ${fill}`}
          style={{ height: `${summarized ? 100 : percent}%` }}
        >
          {stage === "summarizing" ? (
            <span className="bg-background/60 absolute inset-x-0 top-0 h-2 motion-safe:animate-pulse" />
          ) : null}
        </div>
      </div>
      <span className="text-sm font-bold">{facet.name}</span>
      <FacetStatus facet={facet} stage={stage} />
    </div>
  );
}

function FacetStatus({
  facet,
  stage,
}: {
  facet: TopicSetupProgressFacet;
  stage: TopicSetupStage;
}) {
  const muted = "text-muted-foreground flex items-center gap-1.5 text-xs";
  if (stage === "summarizing" || stage === "failed")
    return (
      <span className="text-muted-foreground font-mono text-xs">
        {facet.complete.toLocaleString("en-US")} /{" "}
        {facet.requested.toLocaleString("en-US")}
      </span>
    );
  if (stage === "grouping" || stage === "naming")
    return (
      <span className={muted}>
        <Spinner size="xs" />
        {stage === "grouping" ? "Grouping" : "Naming topics"}
      </span>
    );
  if (facet.outcome === "failed")
    return <span className="text-destructive text-xs">Failed</span>;
  if (NO_TOPICS.has(facet.outcome ?? ""))
    return <span className={muted}>Not enough data yet</span>;
  return (
    <span className={muted}>
      <Check size="sm" aria-hidden="true" />
      {facet.topicCount === null
        ? "Topics ready"
        : `${facet.topicCount} ${facet.topicCount === 1 ? "topic" : "topics"}`}
    </span>
  );
}
