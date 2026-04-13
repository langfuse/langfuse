import { useState, useSyncExternalStore } from "react";
import {
  getSpielwieseDashboardVm,
  getSpielwieseShellVm,
} from "../adapters/dashboardVm";
import {
  defaultSpielwieseDashboardDebugState,
  SpielwieseDashboardDebugHud,
  type SpielwieseDashboardDebugState,
} from "../components/SpielwieseDashboardDebugHud";
import { SpielwieseEditorCanvas } from "../components/SpielwieseEditorCanvas";
import { SpielwiesePromptCanvas } from "../components/SpielwiesePromptCanvas";
import {
  getSpielwieseAgentNodeChromeVariableStyle,
  getSpielwieseAgentNodeColorVariableStyle,
  getSpielwieseMessageSectionChipVariableStyle,
} from "../components/spielwieseAgentNodeColorPalette";
import { SpielwieseVariableValuesProvider } from "../components/useSpielwieseVariableValues";
import { useSpielwieseVariablesPanelState } from "../components/useSpielwieseVariablesPanelState";
import { SpielwieseDashboardShell } from "../shell/SpielwieseDashboardShell";
import { useSpielwieseShell } from "../shell/SpielwieseShellProvider";
import type { SpielwieseDashboardVM } from "../types/dashboard";

function subscribeToHash(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function getPageIdFromHash() {
  if (typeof window === "undefined") {
    return "assistant";
  }

  const hash = window.location.hash.replace(/^#/, "");
  return hash || "assistant";
}

function SpielwieseDashboardCanvas({
  dashboard,
  debugState,
  onDetectedVariablesChange,
}: {
  dashboard: SpielwieseDashboardVM;
  debugState: SpielwieseDashboardDebugState;
  onDetectedVariablesChange: (labels: string[]) => void;
}) {
  const { closeSidePanels } = useSpielwieseShell();

  if (dashboard.promptCanvas) {
    return <SpielwiesePromptCanvas promptCanvas={dashboard.promptCanvas} />;
  }

  return (
    <SpielwieseEditorCanvas
      canvas={dashboard.canvas}
      debugState={debugState}
      onCloseSidePanels={closeSidePanels}
      onDetectedVariablesChange={onDetectedVariablesChange}
    />
  );
}

export default function SpielwieseDashboardPage() {
  const pageId = useSyncExternalStore(
    subscribeToHash,
    getPageIdFromHash,
    () => "assistant",
  );
  const dashboard = getSpielwieseDashboardVm(pageId);
  const shell = getSpielwieseShellVm(pageId);
  const variablesState = useSpielwieseVariablesPanelState(
    dashboard.variablesPanel.items,
  );
  const [debugState, setDebugState] = useState(
    defaultSpielwieseDashboardDebugState,
  );
  const debugColorStyle = {
    ...getSpielwieseMessageSectionChipVariableStyle({
      bottom: debugState.messageSectionChipPaddingBottom,
      left: debugState.messageSectionChipPaddingLeft,
      right: debugState.messageSectionChipPaddingRight,
      top: debugState.messageSectionChipPaddingTop,
    }),
    ...getSpielwieseAgentNodeColorVariableStyle(debugState.nodeColors),
    ...getSpielwieseAgentNodeChromeVariableStyle({
      colors: debugState.nodeColors,
      settings: debugState.nodeChrome,
    }),
  };

  return (
    <div
      className="h-screen-with-banner isolate overflow-hidden [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased"
      data-spielwiese
      style={debugColorStyle}
    >
      <SpielwieseVariableValuesProvider items={variablesState.items}>
        <SpielwieseDashboardShell
          dashboard={dashboard}
          shell={shell}
          variablesState={variablesState}
        >
          <>
            <SpielwieseDashboardCanvas
              dashboard={dashboard}
              debugState={debugState}
              onDetectedVariablesChange={
                variablesState.onEnsureDetectedVariables
              }
            />
            <SpielwieseDashboardDebugHud
              onChange={setDebugState}
              state={debugState}
            />
          </>
        </SpielwieseDashboardShell>
      </SpielwieseVariableValuesProvider>
    </div>
  );
}
