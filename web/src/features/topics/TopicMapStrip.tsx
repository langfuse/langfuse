import { type ReactNode } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { cn } from "@/src/utils/tailwind";
import { formatTopicRunCost } from "./topic-run-labels";
import {
  topicRuleFreshness,
  topicWindowLabel,
  type TopicAnalysisMap,
  type TopicRuleMap,
} from "./topic-maps";

function Strip({
  status,
  run,
  controls,
  options,
}: {
  status?: string;
  run?: { cost: string; onView: () => void };
  controls?: ReactNode;
  options?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "ph-no-capture shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm md:flex",
        run ? "flex" : "hidden",
      )}
    >
      {controls && (
        <span className="hidden items-center gap-3 md:flex">{controls}</span>
      )}
      <span
        className={cn(
          "flex flex-wrap items-center gap-y-1 md:ml-auto",
          run ? "gap-x-3" : "gap-x-6",
        )}
      >
        {status && (
          <span className="text-muted-foreground whitespace-nowrap">
            {status}
          </span>
        )}
        {run && (
          <>
            <span className="text-muted-foreground">{run.cost}</span>
            <Button
              text="View run"
              size="sm"
              variant="text"
              onClick={run.onView}
            />
          </>
        )}
        {options && <span className="hidden md:flex">{options}</span>}
      </span>
    </div>
  );
}

/** The selected live map's controls and when its map was last fitted or refreshed. */
function TopicRuleStrip({
  rule,
  now,
  mapShown = false,
  controls,
  options,
}: {
  rule: TopicRuleMap;
  now: number;
  /** A topic map is on screen (e.g. setup's), so "pending" would contradict it. */
  mapShown?: boolean;
  /** Question tabs and view switch. */
  controls?: ReactNode;
  /** View options, e.g. the Unassigned switch. */
  options?: ReactNode;
}) {
  return (
    <Strip
      status={topicRuleStatus(rule, now, mapShown)}
      controls={controls}
      options={options}
    />
  );
}

/** A live map's status line, e.g. "Updated 2h ago"; empty when there is nothing to say. */
export function topicRuleStatus(
  rule: TopicRuleMap,
  now: number,
  mapShown: boolean,
) {
  if (rule.refresh.running) return "Refreshing map…";
  if (rule.enabled === false || rule.lastRefitAt || !mapShown)
    return topicRuleFreshness(rule, now);
  return "";
}

/** A past run's controls and the period it covered. */
function TopicAnalysisStrip({
  analysis,
  estimatedCost,
  onViewRun,
  controls,
  options,
}: {
  analysis: TopicAnalysisMap;
  estimatedCost: number | null | undefined;
  onViewRun: () => void;
  controls?: ReactNode;
  options?: ReactNode;
}) {
  const cost = formatTopicRunCost(
    { operation: "update", analysis },
    estimatedCost,
  );
  return (
    <Strip
      status={topicAnalysisStatus(analysis)}
      run={{
        cost: analysis.summarize ? `Summaries and embeddings · ${cost}` : cost,
        onView: onViewRun,
      }}
      controls={controls}
      options={options}
    />
  );
}

/** A past run's status line: its trace count and period. */
function topicAnalysisStatus(analysis: TopicAnalysisMap) {
  return `${analysis.traceCount.toLocaleString("en-US")} traces · ${topicWindowLabel(analysis.timeRange)}`;
}

/** The row under the Topics header for a live map or a past run. */
export const TopicMapStrip = {
  Rule: TopicRuleStrip,
  Analysis: TopicAnalysisStrip,
};
