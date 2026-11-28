import { createContext, useContext } from "react";
import { type HomeDashboardPresetId, type FilterState } from "@langfuse/shared";
import { type WidgetDefinition } from "@langfuse/shared/dashboards";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import type { PresetSelection } from "@/src/features/dashboard/components/home-preset-registry";

export type HomePresetDraft = {
  source: { placementId: string; presetId: HomeDashboardPresetId };
  selection: PresetSelection;
  template?: boolean;
};

export type BlockEditorRequest = (
  | {
      kind: "multiQuery" | "markdown";
      definition?: WidgetDefinition;
      initialTabId?: string;
      preset?: never;
    }
  | {
      kind: "multiQuery";
      definition?: never;
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
  capabilities: { multiQuery: boolean; markdown: boolean };
  openEditor: (request: BlockEditorRequest) => void;
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
      | "remove"
      | "placement",
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
