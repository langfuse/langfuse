import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { api } from "@/src/utils/api";
import { useDashboardBlocksData } from "./useDashboardBlocksData";
import { render, screen } from "@testing-library/react";
import { useEffect, type ComponentProps } from "react";
import { type SavedDashboardBlock } from "@langfuse/shared";
import { DashboardBlocksCanvas } from "./DashboardBlocksCanvas";
import {
  DashboardBlocksContext,
  type DashboardBlocksContextValue,
} from "./dashboard-block-context";
import { type DashboardGrid } from "@/src/features/widgets/components/DashboardGrid";

const lifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));
vi.mock("@/src/features/widgets/components/DashboardGrid", () => ({
  DashboardGrid: function Grid({
    widgets,
  }: ComponentProps<typeof DashboardGrid>) {
    useEffect(() => {
      lifecycle.mounts++;
      return () => {
        lifecycle.unmounts++;
      };
    }, []);
    return (
      <div data-testid="classic-grid">
        {widgets.map((widget) => widget.id).join(",")}
      </div>
    );
  },
}));
vi.mock("next/dynamic", () => ({
  default: () =>
    function Block({ block }: { block: SavedDashboardBlock }) {
      return <p>{block.config.title}</p>;
    },
}));

const widgets: ComponentProps<typeof DashboardGrid>["widgets"] = [
  {
    type: "widget",
    id: "classic",
    widgetId: "widget",
    x: 0,
    y: 0,
    x_size: 12,
    y_size: 4,
  },
];
const block: SavedDashboardBlock = {
  id: "note",
  kind: "markdown",
  revision: 1,
  beforePlacementId: "classic",
  config: { version: 1, title: "Context", content: "A note" },
};
const initial: DashboardBlocksContextValue = {
  projectId: "project",
  dashboardId: "dashboard",
  canEdit: false,
  readPath: "v4",
  dateRange: undefined,
  filterState: [],
  capabilitiesPending: true,
  capabilities: { markdown: false, multiQuery: false },
  blocksPending: true,
  blocks: [],
  widgets,
  placementOptions: [],
  loadError: false,
  openEditor: vi.fn(),
  track: vi.fn(),
};
const gridProps: ComponentProps<typeof DashboardGrid> = {
  projectId: "project",
  dashboardId: "dashboard",
  canEdit: false,
  readPath: "v4",
  dateRange: undefined,
  filterState: [],
  widgets,
  onChange: vi.fn(),
  onDeleteWidget: vi.fn(),
  dashboardOwner: "PROJECT",
};
function Canvas({ state }: { state: DashboardBlocksContextValue }) {
  return (
    <DashboardBlocksContext.Provider value={state}>
      <DashboardBlocksCanvas gridProps={gridProps} />
    </DashboardBlocksContext.Provider>
  );
}

it.each(["loaded blocks", "read failure", "flag off"] as const)(
  "waits for the initial layout read before mounting classic widgets: %s",
  (outcome) => {
    lifecycle.mounts = 0;
    lifecycle.unmounts = 0;
    const view = render(<Canvas state={initial} />);
    expect(screen.queryByTestId("classic-grid")).not.toBeInTheDocument();
    expect(lifecycle.mounts).toBe(0);
    const loadingBlocks = {
      ...initial,
      capabilitiesPending: false,
      capabilities: { markdown: true, multiQuery: true },
    };
    view.rerender(<Canvas state={loadingBlocks} />);
    expect(lifecycle.mounts).toBe(0);
    const ready = {
      ...loadingBlocks,
      blocksPending: false,
      blocks: outcome === "loaded blocks" ? [block] : [],
      loadError: outcome === "read failure",
      capabilities: {
        markdown: outcome !== "flag off",
        multiQuery: outcome !== "flag off",
      },
    };
    view.rerender(<Canvas state={ready} />);
    expect(screen.getByTestId("classic-grid")).toHaveTextContent("classic");
    expect(lifecycle.mounts).toBe(1);
    if (outcome === "read failure")
      expect(screen.getByRole("alert")).toBeVisible();
    // Background refreshes retain the last loaded layout, including on failure.
    view.rerender(<Canvas state={{ ...ready, loadError: true }} />);
    view.rerender(<Canvas state={{ ...ready, blocks: [...ready.blocks] }} />);
    expect(lifecycle.mounts).toBe(1);
    expect(lifecycle.unmounts).toBe(0);
    // Explicit layout changes still render classic charts when the last block is removed.
    view.rerender(<Canvas state={{ ...ready, blocks: [] }} />);
    expect(screen.getByTestId("classic-grid")).toHaveTextContent("classic");
    view.rerender(<Canvas state={{ ...ready, blocks: [block] }} />);
    expect(screen.getByText("Context")).toBeVisible();
    expect(screen.getByTestId("classic-grid")).toHaveTextContent("classic");
  },
);

it("keeps classic charts available when the first block read is paused offline", () => {
  const wasOnline = onlineManager.isOnline();
  onlineManager.setOnline(false);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { networkMode: "online", retry: false } },
  });
  function DataCanvas() {
    const data = useDashboardBlocksData({
      projectId: "offline-project",
      dashboardId: "offline-dashboard",
      canEdit: false,
      readPath: "v4",
      widgets,
    });
    return <Canvas state={{ ...initial, ...data }} />;
  }
  const Page = api.withTRPC(() => (
    <QueryClientProvider client={queryClient}>
      <DataCanvas />
    </QueryClientProvider>
  ));
  const view = render(<Page />);
  try {
    expect(screen.getByTestId("classic-grid")).toHaveTextContent("classic");
    expect(
      screen.queryByRole("status", { name: "Loading dashboard layout" }),
    ).not.toBeInTheDocument();
  } finally {
    view.unmount();
    queryClient.clear();
    onlineManager.setOnline(wasOnline);
  }
});
