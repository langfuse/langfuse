import { type ReactNode } from "react";
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
    <div className="ph-no-capture flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm">
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

/** The selected live map's controls; a status line only while paused or building. */
function TopicRuleStrip({
  rule,
  now,
  controls,
  options,
}: {
  rule: TopicRuleMap;
  now: number;
  /** Question tabs and view switch. */
  controls?: ReactNode;
  /** View options, e.g. the Unassigned switch. */
  options?: ReactNode;
}) {
  return (
    <Strip
      trailing={ruleTrailing(rule, now)}
      controls={controls}
      options={options}
    />
  );
}

function ruleTrailing(rule: TopicRuleMap, now: number) {
  if (rule.enabled === false || !rule.lastRefitAt)
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
