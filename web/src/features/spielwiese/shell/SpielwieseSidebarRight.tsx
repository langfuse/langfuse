import { SidebarContent, SidebarHeader, SidebarSurface } from "../ui/sidebar";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import {
  SpielwieseVariablesPanel,
  SpielwieseVariablesSummary,
} from "../components/SpielwieseVariablesPanel";
import { useSpielwieseVariablesPanelState } from "../components/useSpielwieseVariablesPanelState";

type SpielwieseSidebarRightProps = {
  dashboard: SpielwieseDashboardVM;
};

export function SpielwieseSidebarRight({
  dashboard,
}: SpielwieseSidebarRightProps) {
  const variablesState = useSpielwieseVariablesPanelState(
    dashboard.variablesPanel.items,
  );

  return (
    <SidebarSurface className="border-sidebar-border bg-background overflow-hidden border-l">
      <SidebarHeader className="border-sidebar-border border-b px-4 py-3">
        <SpielwieseVariablesSummary
          actionLabel={dashboard.variablesPanel.actionLabel}
          count={variablesState.items.length}
          onCreate={variablesState.onCreate}
        />
      </SidebarHeader>
      <SidebarContent className="overflow-y-auto px-3 py-3">
        <SpielwieseVariablesPanel state={variablesState} />
      </SidebarContent>
    </SidebarSurface>
  );
}
