import type { FilterState } from "@langfuse/shared";
import type { TopicFacet, TopicFacetRef } from "@langfuse/shared/topics";
import type { RouterOutputs } from "@/src/utils/api";

export type TopicMapsOverview = RouterOutputs["topics"]["maps"];
export type TopicRuleMap = TopicMapsOverview["rules"][number];
export type TopicAnalysisMap = TopicMapsOverview["analyses"][number];

/** A rule's live map, or one run of an analysis (its latest by default). */
export type TopicMapSelection =
  | { kind: "rule"; id: string }
  | { kind: "analysis"; id: string; runId: string };

/** Reads `?map=rule:<id>` or `?map=analysis:<id>&run=<executionId>`; unknown IDs fall back to the first rule. */
export function resolveTopicMapSelection(
  overview: TopicMapsOverview | undefined,
  map: string | undefined,
  run: string | undefined,
): TopicMapSelection | null {
  if (!overview) return null;
  const [kind, id] = map?.split(":", 2) ?? [];
  if (kind === "analysis") {
    const analysis = overview.analyses.find((item) => item.id === id);
    if (analysis) {
      const runId = analysis.runs.some((item) => item.executionId === run)
        ? run!
        : analysis.latestExecutionId;
      return { kind: "analysis", id: analysis.id, runId };
    }
  }
  const rule =
    (kind === "rule" && overview.rules.find((item) => item.id === id)) ||
    overview.rules[0];
  return rule ? { kind: "rule", id: rule.id } : null;
}

export function topicMapQuery(selection: TopicMapSelection) {
  return selection.kind === "rule"
    ? { map: `rule:${selection.id}`, run: undefined }
    : { map: `analysis:${selection.id}`, run: selection.runId };
}

function filterValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** One chip per filter, e.g. `traceName: support-agent` or `latency > 10`. */
export function topicFilterChips(filter: FilterState) {
  return filter.map((item) => {
    const column =
      "key" in item && item.key ? `${item.column}.${item.key}` : item.column;
    const value = "value" in item ? filterValue(item.value) : "";
    if (item.operator === "=" || item.operator === "any of")
      return `${column}: ${value}`;
    return `${column} ${item.operator} ${value}`.trim();
  });
}

/** The rule name suggested from its filters, before the user edits it. */
export function suggestTopicRuleName(filter: FilterState) {
  const values = filter.flatMap((item) =>
    "value" in item ? [filterValue(item.value)] : [],
  );
  return values.filter(Boolean).join(" · ").slice(0, 100) || "All traces";
}

/** The analysis label suggested from its filters. */
export function suggestTopicAnalysisLabel(filter: FilterState) {
  return filter.length
    ? topicFilterChips(filter).join(" · ").slice(0, 100)
    : "All summarized traces";
}

function hoursLabel(ms: number) {
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  return `${hours} h`;
}

/** "Updated 2 h ago · next refit in 22 h" for a rule map. */
export function topicRuleFreshness(
  rule: Pick<TopicRuleMap, "enabled" | "lastRefitAt" | "nextRefitAt">,
  now: number,
) {
  if (rule.enabled === false) return "Disabled · map frozen";
  if (!rule.lastRefitAt) return "Building first topics";
  const updated = `Updated ${hoursLabel(now - Date.parse(rule.lastRefitAt))} ago`;
  if (!rule.nextRefitAt) return updated;
  const next = Date.parse(rule.nextRefitAt) - now;
  return next > 0
    ? `${updated} · next refit in ${hoursLabel(next)}`
    : `${updated} · refit due`;
}

/** The selected facets at their current prompt versions. */
export function latestFacetRefs(
  facets: TopicFacet[],
  ids: string[],
): TopicFacetRef[] {
  return facets.flatMap((facet) => {
    const version = facet.versions[0]?.version;
    return ids.includes(facet.id) && version
      ? [{ facetId: facet.id, version }]
      : [];
  });
}

/** A window of whole days ending at `now`. */
export function dayWindow(days: number, now: number) {
  return { from: new Date(now - days * 86_400_000), to: new Date(now) };
}

export function samplingLabel(sampling: number) {
  return `${Math.round(sampling * 1000) / 10}%`;
}

const dayFormat = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});

/** A fixed analysis window, e.g. "21 Oct – 28 Oct". */
export function topicWindowLabel(range: { from: Date; to: Date }) {
  return `${dayFormat.format(range.from)} – ${dayFormat.format(new Date(range.to.getTime() - 1))}`;
}
