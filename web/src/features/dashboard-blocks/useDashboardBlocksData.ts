import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { isDashboardBlockReadDenied } from "./dashboard-block-capabilities";
import { useDashboardBlockCapabilities } from "./useDashboardBlockCapabilities";
import { HOME_DASHBOARD_PRESET_IDS } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { type DashboardPlacement } from "@/src/features/widgets/components/DashboardGrid";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { getHomePresetMetadata } from "@/src/features/dashboard/components/home-preset-registry";
import { type DashboardBlocksContextValue } from "./dashboard-block-context";

export function useDashboardBlocksData({
  projectId,
  dashboardId,
  canEdit,
  readPath,
  widgets,
  hasDashboardBlocks,
  dashboardReady = true,
  authoringEnabled = false,
}: {
  projectId: string;
  dashboardId: string;
  canEdit: boolean;
  readPath: ResolvedReadPath;
  widgets: DashboardPlacement[];
  hasDashboardBlocks?: boolean;
  dashboardReady?: boolean;
  authoringEnabled?: boolean;
}) {
  const canAuthor =
    dashboardReady &&
    typeof hasDashboardBlocks === "boolean" &&
    authoringEnabled &&
    canEdit;
  const capabilitiesQuery = useDashboardBlockCapabilities(projectId, canAuthor);
  const capabilities = canAuthor
    ? (capabilitiesQuery.data ?? { multiQuery: false, markdown: false })
    : { multiQuery: false, markdown: false };
  const readsEnabled = dashboardReady && hasDashboardBlocks === true;
  const utils = api.useUtils();
  const queryClient = useQueryClient();
  const input = { projectId, dashboardId, includeConvertedPresets: true };
  const queryKey = getQueryKey(
    api.dashboard.getDashboardBlocks,
    input,
    "query",
  );
  const saved = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      try {
        return await utils.client.dashboard.getDashboardBlocks.query(input, {
          signal,
        });
      } catch (error) {
        // A later transient failure must not restore rows after read access was denied.
        if (isDashboardBlockReadDenied(error))
          queryClient.setQueryData(queryKey, []);
        throw error;
      }
    },
    enabled: readsEnabled && Boolean(projectId) && Boolean(dashboardId),
    staleTime: 0,
    refetchOnMount: true,
    retry: false,
    meta: { silentHttpCodes: [404] },
  });
  const widgetNames = api.dashboardWidgets.all.useQuery(
    { projectId, orderBy: { column: "updatedAt", order: "DESC" } },
    {
      enabled: canAuthor && widgets.some((widget) => widget.type === "widget"),
      staleTime: 60_000,
    },
  );
  const scope = JSON.stringify([projectId, dashboardId]);
  const loading = readsEnabled && saved.isLoading;
  const canSettleInitialRead = dashboardReady && !loading;
  const [bootstrap, setBootstrap] = useState({
    scope,
    settled: canSettleInitialRead,
  });
  if (bootstrap.scope !== scope)
    setBootstrap({ scope, settled: canSettleInitialRead });
  else if (!bootstrap.settled && canSettleInitialRead)
    setBootstrap({ scope, settled: true });
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
    capabilitiesPending: canAuthor && capabilitiesQuery.isPending,
    blocksPending: loading && (bootstrap.scope !== scope || !bootstrap.settled),
    blocks: readsEnabled ? (saved.data ?? []) : [],
    placementOptions,
    loadError: readsEnabled && saved.isError,
  };
}

function placementName(
  widget: DashboardPlacement,
  index: number,
  version: "v1" | "v2",
  names: ReadonlyMap<string, string>,
) {
  if (widget.type === "preset") {
    const preset = HOME_DASHBOARD_PRESET_IDS.find(
      (id) => id === widget.presetId,
    );
    return preset
      ? getHomePresetMetadata(preset, version).name
      : widget.presetId;
  }
  return names.get(widget.widgetId) ?? `chart ${index + 1}`;
}
