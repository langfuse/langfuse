import { type ReactNode } from "react";
import {
  topicRuleFreshness,
  topicWindowLabel,
  type TopicAnalysisMap,
  type TopicRuleMap,
} from "./topic-maps";

function Strip({
  status,
  controls,
  options,
}: {
  status?: string;
  controls?: ReactNode;
  options?: ReactNode;
}) {
  return (
    // Below md the controls and options move to the handheld row and the status to the title row.
    <div className="ph-no-capture hidden shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm md:flex">
      {controls && <span className="flex items-center gap-3">{controls}</span>}
      <span className="ml-auto flex items-center gap-6">
        {status && (
          <span className="text-muted-foreground whitespace-nowrap">
            {status}
          </span>
        )}
        {options && <span className="flex">{options}</span>}
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

/** A live map's status line, e.g. "Updated 2 h ago"; empty when there is nothing to say. */
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
  controls,
  options,
}: {
  analysis: TopicAnalysisMap;
  controls?: ReactNode;
  options?: ReactNode;
}) {
  return (
    <Strip
      status={topicAnalysisStatus(analysis)}
      controls={controls}
      options={options}
    />
  );
}

/** A past run's status line: its trace count and period. */
export function topicAnalysisStatus(analysis: TopicAnalysisMap) {
  return `${analysis.traceCount.toLocaleString("en-US")} traces · ${topicWindowLabel(analysis.timeRange)}`;
}

/** The row under the Topics header for a live map or a past run. */
export const TopicMapStrip = {
  Rule: TopicRuleStrip,
  Analysis: TopicAnalysisStrip,
};
