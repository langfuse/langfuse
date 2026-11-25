import { type ParsedUrlQuery } from "querystring";

export function buildDashboardEditorHref({
  projectId,
  dashboardId,
  query,
  fallbackDateRange,
  editId,
  tabId,
}: {
  projectId: string;
  dashboardId: string;
  query: ParsedUrlQuery;
  fallbackDateRange?: string;
  editId?: string;
  tabId?: string;
}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (
      ["projectId", "dashboardId", "edit", "tab", "addWidgetId"].includes(key)
    )
      continue;
    if (Array.isArray(value))
      value.forEach((entry) => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  }
  if (!params.has("dateRange") && fallbackDateRange)
    params.set("dateRange", fallbackDateRange);
  if (tabId) params.set("tab", tabId);
  if (editId) params.set("edit", editId);
  const queryString = params.toString();
  return `/project/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(dashboardId)}/studio${queryString ? `?${queryString}` : ""}`;
}
