import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";
import { rangeToString } from "@/src/utils/date-range-utils";

export function buildAgentProfilePath({
  projectId,
  agentName,
  from,
  to,
  filter,
  tab,
}: {
  projectId: string;
  agentName: string;
  from: Date;
  to: Date;
  filter: FilterState;
  tab?: string;
}): string {
  const query = new URLSearchParams({ dateRange: rangeToString({ from, to }) });
  if (filter.length > 0) query.set("filter", encodeFiltersGeneric(filter));
  if (tab) query.set("tab", tab);
  const base = `/project/${encodeURIComponent(projectId)}/agents`;
  // URL parsers normalize literal and percent-encoded dot path segments.
  // A query parameter preserves these valid names without a reserved route.
  if (agentName === "." || agentName === "..") {
    query.set("agentName", agentName);
    return `${base}?${query.toString()}`;
  }
  return `${base}/${encodeURIComponent(agentName)}?${query.toString()}`;
}
