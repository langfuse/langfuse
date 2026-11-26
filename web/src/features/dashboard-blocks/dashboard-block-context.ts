import { createContext, useContext } from "react";
import {
  type SavedDashboardBlock,
  type HomeDashboardPresetId,
  type FilterState,
} from "@langfuse/shared";
import { type DashboardPlacement } from "@/src/features/widgets/components/DashboardGrid";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import type { PresetSelection } from "@/src/features/dashboard/components/home-preset-registry";

export type HomePresetDraft = {
  source: NonNullable<SavedDashboardBlock["sourcePreset"]>;
  selection: PresetSelection;
  template?: boolean;
};

export type BlockEditorRequest = (
  | {
      kind: "multiQuery" | "markdown";
      block?: SavedDashboardBlock;
      initialTabId?: string;
      preset?: never;
    }
  | {
      kind: "multiQuery";
      block?: never;
      initialTabId?: never;
      preset: HomePresetDraft;
    }
) & {
  onTabSaved?: (tabId: string) => void;
  widgetId?: string;
  expectedRevision?: number;
};

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
  savedPresetTabs?: ReadonlyMap<string, string>;
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
      | "preset_edit"
      | "preset_convert"
      | "preset_restore"
      | "remove"
      | "placement"
      | "layout_open"
      | "layout_close",
    kind?: "multiQuery" | "markdown",
    isNew?: boolean,
    presetId?: HomeDashboardPresetId,
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
