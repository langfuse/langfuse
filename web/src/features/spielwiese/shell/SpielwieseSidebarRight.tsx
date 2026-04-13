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

const spielwieseRightSidebarHeaderClassName =
  "gap-0 p-0 px-3 pt-2 pb-[11px] shadow-[rgb(238,239,241)_0px_1px_0px_0px]";
const spielwieseRightSidebarContentClassName =
  "gap-0 overflow-y-auto px-3 pt-0 pb-3";

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
      className="overflow-hidden bg-[#F3F3F4]"
      data-testid="spielwiese-right-sidebar"
    >
      {rightPanelMode === "model-recommendation" &&
      modelRecommendationTarget ? (
        <>
          <SidebarHeader
            className={spielwieseRightSidebarHeaderClassName}
            data-testid="spielwiese-right-sidebar-header"
          >
            <SpielwieseModelRecommendationHeader
              onBack={closeModelRecommendation}
              target={modelRecommendationTarget}
            />
          </SidebarHeader>
          <SidebarContent className={spielwieseRightSidebarContentClassName}>
            <SpielwieseModelRecommendationPanel
              target={modelRecommendationTarget}
            />
          </SidebarContent>
        </>
      ) : (
        <>
          <SidebarHeader
            className={spielwieseRightSidebarHeaderClassName}
            data-testid="spielwiese-right-sidebar-header"
          >
            <SpielwieseVariablesSummary
              actionLabel={dashboard.variablesPanel.actionLabel}
              count={variablesState.items.length}
              onCreate={variablesState.onCreate}
            />
          </SidebarHeader>
          <SidebarContent className={spielwieseRightSidebarContentClassName}>
            <SpielwieseVariablesPanel state={variablesState} />
          </SidebarContent>
        </>
      )}
    </SidebarSurface>
  );
}
