import { Badge } from "@/src/components/design-system/Badge/Badge";
import { cn } from "@/src/utils/tailwind";
import {
  samplingLabel,
  topicFilterChips,
  topicRuleFreshness,
  topicWindowLabel,
  type TopicAnalysisMap,
  type TopicRuleMap,
} from "./topic-maps";

function FilterChips({ filter }: { filter: TopicRuleMap["filter"] }) {
  const chips = topicFilterChips(filter);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {chips.length ? (
        chips.map((chip) => (
          <Badge key={chip} text={chip} size="sm" color="filled" />
        ))
      ) : (
        <Badge text="All traces" size="sm" color="filled" />
      )}
    </span>
  );
}

function Strip({
  tone,
  children,
}: {
  tone: "live" | "snapshot";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1.5 text-xs",
        tone === "snapshot" && "bg-light-blue/40",
      )}
    >
      {children}
    </div>
  );
}

/** Scope, sampling and freshness of the selected rule's live map. */
function TopicRuleStrip({ rule, now }: { rule: TopicRuleMap; now: number }) {
  return (
    <Strip tone="live">
      <Badge text="Live" size="sm" color="green" />
      <FilterChips filter={rule.filter} />
      <Badge
        text={`Sampling ${samplingLabel(rule.sampling)}`}
        size="sm"
        color="primary"
      />
      <span className="text-muted-foreground ml-auto">
        {topicRuleFreshness(rule, now)}
      </span>
    </Strip>
  );
}

/** The blue snapshot strip of an analysis: its slice and window. */
function TopicAnalysisStrip({ analysis }: { analysis: TopicAnalysisMap }) {
  return (
    <Strip tone="snapshot">
      <Badge text="Snapshot" size="sm" color="blue" />
      <FilterChips filter={analysis.filter} />
      <span className="text-muted-foreground">
        {topicWindowLabel(analysis.timeRange)} ·{" "}
        {analysis.traceCount.toLocaleString("en-US")} traces
      </span>
    </Strip>
  );
}

/** The strip under the Topics header: a rule's live scope or an analysis's snapshot. */
export const TopicMapStrip = Object.assign(Strip, {
  Rule: TopicRuleStrip,
  Analysis: TopicAnalysisStrip,
});
