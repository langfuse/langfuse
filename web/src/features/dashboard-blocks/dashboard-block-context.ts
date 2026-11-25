import { createContext, useContext } from "react";
import { type SavedDashboardBlock, type FilterState } from "@langfuse/shared";
import { type DashboardPlacement } from "@/src/features/widgets/components/DashboardGrid";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";

export type BlockEditorRequest =
  | { kind: "markdown"; block?: SavedDashboardBlock }
  | { kind: "multiQuery"; block?: SavedDashboardBlock; initialTabId?: string };

export type DashboardBlocksContextValue = {
  projectId: string;
  dashboardId: string;
  canEdit: boolean;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  capabilitiesPending: boolean;
  blocksPending: boolean;
  capabilities: { multiQuery: boolean; markdown: boolean };
  blocks: SavedDashboardBlock[];
  widgets: DashboardPlacement[];
  placementOptions: { value: string | null; label: string }[];
  loadError: boolean;
  openEditor: (request: BlockEditorRequest) => void;
  openPositionEditor: (block: SavedDashboardBlock) => void;
  track: (
    action:
      | "preview"
      | "add"
      | "edit"
      | "save"
      | "cancel"
      | "duplicate"
      | "remove"
      | "placement"
      | "layout_open"
      | "layout_close",
    kind?: "multiQuery" | "markdown",
    isNew?: boolean,
  ) => void;
};

export const DashboardBlocksContext = createContext<
  DashboardBlocksContextValue | undefined
>(undefined);

export function useDashboardBlocks() {
  const context = useContext(DashboardBlocksContext);
  if (!context) throw new Error("Dashboard widgets require their provider");
  return context;
}
