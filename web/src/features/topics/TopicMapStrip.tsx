import { type ReactNode } from "react";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { costFormatter } from "@/src/utils/numbers";
import {
  topicRuleFreshness,
  topicWindowLabel,
  type TopicAnalysisMap,
  type TopicRuleMap,
} from "./topic-maps";

const COST_EXPLANATION =
  "Model cost of summarizing and embedding the traces in this map so far, billed by your provider. Traces shared with other maps count toward each. Topic naming is not included.";

function Strip({
  trailing,
  cost,
  controls,
  options,
}: {
  trailing?: string;
  cost?: number | null;
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
        {cost != null && <MapCost cost={cost} />}
        {options && <span className="hidden md:flex">{options}</span>}
      </span>
    </div>
  );
}

function MapCost({ cost }: { cost: number }) {
  return (
    <Tooltip label={COST_EXPLANATION} hoverableContent={false}>
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          className="text-muted-foreground cursor-default whitespace-nowrap tabular-nums"
        >
          ~{costFormatter(cost)} processing cost
        </span>
      )}
    </Tooltip>
  );
}

/** The selected live map's controls; a status line only while paused or building. */
function TopicRuleStrip({
  rule,
  now,
  mapShown = false,
  cost,
  controls,
  options,
}: {
  rule: TopicRuleMap;
  now: number;
  /** A topic map is on screen (e.g. setup's), so "pending" would contradict it. */
  mapShown?: boolean;
  /** What processing this map has cost so far; hidden while unknown. */
  cost?: number | null;
  /** Question tabs and view switch. */
  controls?: ReactNode;
  /** View options, e.g. the Unassigned switch. */
  options?: ReactNode;
}) {
  return (
    <Strip
      trailing={ruleTrailing(rule, now, mapShown)}
      cost={cost}
      controls={controls}
      options={options}
    />
  );
}

function ruleTrailing(rule: TopicRuleMap, now: number, mapShown: boolean) {
  if (rule.enabled === false || (!rule.lastRefitAt && !mapShown))
    return topicRuleFreshness(rule, now);
  return "";
}

/** A past run's controls and the period it covered. */
function TopicAnalysisStrip({
  analysis,
  cost,
  controls,
  options,
}: {
  analysis: TopicAnalysisMap;
  cost?: number | null;
  controls?: ReactNode;
  options?: ReactNode;
}) {
  return (
    <Strip
      trailing={`${analysis.traceCount.toLocaleString("en-US")} traces · ${topicWindowLabel(analysis.timeRange)}`}
      cost={cost}
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
