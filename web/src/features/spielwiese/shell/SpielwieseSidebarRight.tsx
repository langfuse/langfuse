import { SidebarContent, SidebarHeader, SidebarSurface } from "../ui/sidebar";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import {
  SpielwieseModelRecommendationHeader,
  SpielwieseModelRecommendationPanel,
} from "../components/SpielwieseModelRecommendationPanel";
import {
  SpielwieseVariablesPanel,
  SpielwieseVariablesSummary,
} from "../components/SpielwieseVariablesPanel";
import type { SpielwieseVariablesPanelState } from "../components/useSpielwieseVariablesPanelState";
import { useSpielwieseShell } from "./SpielwieseShellProvider";

type SpielwieseSidebarRightProps = {
  dashboard: SpielwieseDashboardVM;
  variablesState: SpielwieseVariablesPanelState;
};

export function SpielwieseSidebarRight({
  dashboard,
  variablesState,
}: SpielwieseSidebarRightProps) {
  const {
    closeModelRecommendation,
    modelRecommendationTarget,
    rightPanelMode,
  } = useSpielwieseShell();

  return (
    <SidebarSurface
      className="overflow-hidden bg-[#FBFBFB]"
      data-testid="spielwiese-right-sidebar"
    >
      {rightPanelMode === "model-recommendation" &&
      modelRecommendationTarget ? (
        <>
          <SidebarHeader
            className="px-4 py-3"
            data-testid="spielwiese-right-sidebar-header"
          >
            <SpielwieseModelRecommendationHeader
              onBack={closeModelRecommendation}
              target={modelRecommendationTarget}
            />
          </SidebarHeader>
          <SidebarContent className="overflow-y-auto px-3 py-3">
            <SpielwieseModelRecommendationPanel
              target={modelRecommendationTarget}
            />
          </SidebarContent>
        </>
      ) : (
        <>
          <SidebarHeader
            className="px-4 py-3"
            data-testid="spielwiese-right-sidebar-header"
          >
            <SpielwieseVariablesSummary
              actionLabel={dashboard.variablesPanel.actionLabel}
              count={variablesState.items.length}
              onCreate={variablesState.onCreate}
            />
          </SidebarHeader>
          <SidebarContent className="overflow-y-auto px-3 py-3">
            <SpielwieseVariablesPanel state={variablesState} />
          </SidebarContent>
        </>
      )}
    </SidebarSurface>
  );
}
