import {
  getSpielwieseAgentNodeChromeVariableStyle,
  getSpielwieseAgentNodeColorVariableStyle,
  getSpielwieseCanvasLayerVariableStyle,
  getSpielwieseMessageSectionChipVariableStyle,
  spielwieseAgentNodeChromeSettings,
  spielwieseAgentNodeColorPalette,
  spielwieseCanvasLayerPalette,
  spielwieseMessageSectionChipPaddingDefaults,
} from "../../components/spielwieseAgentNodeColorPalette";
import { SpielwieseEditorCanvas } from "../../components/SpielwieseEditorCanvas";
import { SpielwieseVariableValuesProvider } from "../../components/useSpielwieseVariableValues";
import { getSpielwieseDashboardVm } from "../../adapters/dashboardVm";
import { getOnboardingEntryTextMotionClassName } from "../spielwieseOnboardingEntryMotion";

const onboardingPreviewDashboard = getSpielwieseDashboardVm("assistant");
const onboardingUpperCanvasStyle = {
  ...getSpielwieseCanvasLayerVariableStyle({
    colors: spielwieseCanvasLayerPalette,
    highlightedLayer: null,
  }),
  ...getSpielwieseMessageSectionChipVariableStyle({
    bottom: spielwieseMessageSectionChipPaddingDefaults.bottom,
    left: spielwieseMessageSectionChipPaddingDefaults.left,
    right: spielwieseMessageSectionChipPaddingDefaults.right,
    top: spielwieseMessageSectionChipPaddingDefaults.top,
  }),
  ...getSpielwieseAgentNodeColorVariableStyle(spielwieseAgentNodeColorPalette),
  ...getSpielwieseAgentNodeChromeVariableStyle({
    colors: spielwieseAgentNodeColorPalette,
    settings: spielwieseAgentNodeChromeSettings,
  }),
};

export function SpielwieseOnboardingUpperCanvas() {
  return (
    <div
      className={getOnboardingEntryTextMotionClassName(true, 150)}
      data-testid="spielwiese-onboarding-upper-canvas"
      style={onboardingUpperCanvasStyle}
    >
      <SpielwieseVariableValuesProvider
        items={onboardingPreviewDashboard.variablesPanel.items}
      >
        <div className="h-[21rem] min-h-0 overflow-hidden md:h-[24rem]">
          <SpielwieseEditorCanvas
            canvas={onboardingPreviewDashboard.canvas}
            chrome="onboarding-preview"
          />
        </div>
      </SpielwieseVariableValuesProvider>
    </div>
  );
}
