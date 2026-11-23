import { type HomeDashboardPresetId } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { type DashboardPlacement } from "@/src/features/widgets/components/DashboardGrid";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { getHomePresetMetadata } from "@/src/features/dashboard/components/home-preset-registry";
import { type DashboardBlocksContextValue } from "./dashboard-block-context";
import { hasDashboardBlocksLoadError } from "./dashboard-block-errors";

export function useDashboardBlocksData({
  projectId,
  dashboardId,
  canEdit,
  readPath,
  widgets,
}: {
  projectId: string;
  dashboardId: string;
  canEdit: boolean;
  readPath: ResolvedReadPath;
  widgets: DashboardPlacement[];
}) {
  const capabilitiesQuery = api.dashboardBlocks.capabilities.useQuery(
    { projectId },
    {
      staleTime: 15_000,
      refetchOnMount: "always",
      refetchOnWindowFocus: "always",
      refetchInterval: (query) => {
        const active =
          query.state.data?.multiQuery || query.state.data?.markdown;
        return active ? 30_000 : false;
      },
      refetchIntervalInBackground: false,
      retry: false,
      meta: { silentHttpCodes: [404] },
    },
  );
  const capabilities = (!capabilitiesQuery.isError &&
    capabilitiesQuery.data) || { multiQuery: false, markdown: false };
  const kinds: ("multiQuery" | "markdown")[] = [];
  if (capabilities.multiQuery) kinds.push("multiQuery");
  if (capabilities.markdown) kinds.push("markdown");
  const saved = api.dashboardBlocks.getAll.useQuery(
    { projectId, dashboardId, kinds },
    {
      enabled: kinds.length > 0,
      staleTime: 0,
      refetchOnMount: true,
      retry: false,
      meta: { silentHttpCodes: [404] },
    },
  );
  const widgetNames = api.dashboardWidgets.all.useQuery(
    { projectId, orderBy: { column: "updatedAt", order: "DESC" } },
    {
      enabled:
        canEdit &&
        widgets.some((widget) => widget.type === "widget") &&
        kinds.length > 0,
      staleTime: 60_000,
    },
  );
  const names = new Map(
    widgetNames.data?.widgets.map((widget) => [widget.id, widget.name]),
  );
  const version = readPath === "v4" ? "v2" : "v1";
  const placementOptions: DashboardBlocksContextValue["placementOptions"] = [
    { value: null, label: "After all chart rows" },
    ...[...widgets]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((widget, index) => ({
        value: widget.id,
        label: `Before row containing ${placementName(widget, index, version, names)}`,
      })),
  ];
  return {
    capabilities,
    capabilitiesPending: capabilitiesQuery.isPending,
    blocks: (saved.data ?? []).filter((block) => capabilities[block.kind]),
    placementOptions,
    loadError: hasDashboardBlocksLoadError({
      capabilitiesError: capabilitiesQuery.error,
      savedFailed: saved.isError,
    }),
  };
}

function placementName(
  widget: DashboardPlacement,
  index: number,
  version: "v1" | "v2",
  names: ReadonlyMap<string, string>,
) {
  if (widget.type === "preset")
    return getHomePresetMetadata(
      widget.presetId as HomeDashboardPresetId,
      version,
    ).name;
  return names.get(widget.widgetId) ?? `chart ${index + 1}`;
}
