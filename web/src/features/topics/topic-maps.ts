import type { FilterState } from "@langfuse/shared";
import type { TopicFacet, TopicFacetRef } from "@langfuse/shared/topics";
import type { RouterOutputs } from "@/src/utils/api";

export type TopicMapsOverview = RouterOutputs["topics"]["maps"];
export type TopicRuleMap = TopicMapsOverview["rules"][number];
export type TopicAnalysisMap = TopicMapsOverview["analyses"][number];

/** A rule's live map, or one analysis's snapshot. */
export type TopicMapSelection =
  | { kind: "rule"; id: string }
  | { kind: "analysis"; id: string };

/** Reads `?map=rule:<id>` or `?map=analysis:<executionId>`; unknown IDs fall back to the first rule. */
export function resolveTopicMapSelection(
  overview: TopicMapsOverview | undefined,
  map: string | undefined,
): TopicMapSelection | null {
  if (!overview) return null;
  const [kind, id] = map?.split(":", 2) ?? [];
  if (kind === "analysis" && overview.analyses.some((item) => item.id === id))
    return { kind: "analysis", id: id! };
  const rule =
    (kind === "rule" && overview.rules.find((item) => item.id === id)) ||
    overview.rules[0];
  return rule ? { kind: "rule", id: rule.id } : null;
}

export function topicMapQuery(selection: TopicMapSelection) {
  return { map: `${selection.kind}:${selection.id}` };
}

function filterValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** A filter as `column`, `operator` and `value`, e.g. `type`, `=`, `GENERATION`. */
export function topicFilterParts(filter: FilterState) {
  return filter.map((item) => {
    const column =
      "key" in item && item.key ? `${item.column}.${item.key}` : item.column;
    const operator =
      item.operator === "any of" &&
      Array.isArray(item.value) &&
      item.value.length === 1
        ? "="
        : item.operator;
    const value = "value" in item ? filterValue(item.value) : "";
    return { column, operator, value };
  });
}

/** How many filters, e.g. "1 filter" or "No filter". */
export function filterCountLabel(filter: FilterState) {
  if (filter.length === 0) return "No filter";
  return `${filter.length} ${filter.length === 1 ? "filter" : "filters"}`;
}

function hoursLabel(ms: number) {
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  return `${hours} h`;
}

/** "Updated 2 h ago" for a rule map. */
export function topicRuleFreshness(
  rule: Pick<TopicRuleMap, "enabled" | "lastRefitAt">,
  now: number,
) {
  if (rule.enabled === false) return "Paused · map frozen";
  if (!rule.lastRefitAt) return "First clustering pending";
  return `Updated ${hoursLabel(now - Date.parse(rule.lastRefitAt))} ago`;
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

/** A calendar day, e.g. "Nov 3". */
export function topicDayLabel(date: Date | string) {
  return dayFormat.format(new Date(date));
}

/** A fixed analysis window, e.g. "21 Oct – 28 Oct". */
export function topicWindowLabel(range: { from: Date; to: Date }) {
  return `${dayFormat.format(range.from)} – ${dayFormat.format(new Date(range.to.getTime() - 1))}`;
}
