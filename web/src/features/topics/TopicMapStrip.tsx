import { type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import {
  topicRuleFreshness,
  topicWindowLabel,
  type TopicAnalysisMap,
  type TopicRuleMap,
} from "./topic-maps";

function Strip({
  trailing,
  controls,
  options,
}: {
  trailing?: string;
  controls?: ReactNode;
  options?: ReactNode;
}) {
  return (
    // Controls and options move to the handheld row below md, leaving only the status line.
    <div
      className={cn(
        "ph-no-capture shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm",
        trailing ? "flex" : "hidden md:flex",
      )}
    >
      {controls && (
        <span className="hidden items-center gap-3 md:flex">{controls}</span>
      )}
      <span className="ml-auto flex items-center gap-6">
        {trailing && (
          <span className="text-muted-foreground whitespace-nowrap">
            {trailing}
          </span>
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
      trailing={ruleTrailing(rule, now, mapShown)}
      controls={controls}
      options={options}
    />
  );
}

function ruleTrailing(rule: TopicRuleMap, now: number, mapShown: boolean) {
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
      trailing={`${analysis.traceCount.toLocaleString("en-US")} traces · ${topicWindowLabel(analysis.timeRange)}`}
      controls={controls}
      options={options}
    />
  );
}

/** The row under the Topics header for a live map or a past run. */
export const TopicMapStrip = {
  Rule: TopicRuleStrip,
  Analysis: TopicAnalysisStrip,
};
