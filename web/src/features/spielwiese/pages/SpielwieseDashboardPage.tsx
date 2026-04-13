import { useSyncExternalStore } from "react";
import {
  getSpielwieseDashboardVm,
  getSpielwieseShellVm,
} from "../adapters/dashboardVm";
import { SpielwieseEditorCanvas } from "../components/SpielwieseEditorCanvas";
import { SpielwiesePromptCanvas } from "../components/SpielwiesePromptCanvas";
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
  onDetectedVariablesChange,
}: {
  dashboard: SpielwieseDashboardVM;
  onDetectedVariablesChange: (labels: string[]) => void;
}) {
  const { closeSidePanels } = useSpielwieseShell();

  if (dashboard.promptCanvas) {
    return <SpielwiesePromptCanvas promptCanvas={dashboard.promptCanvas} />;
  }

  return (
    <SpielwieseEditorCanvas
      canvas={dashboard.canvas}
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

  return (
    <div
      className="h-screen-with-banner isolate overflow-hidden [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased"
      data-spielwiese
    >
      <SpielwieseVariableValuesProvider items={variablesState.items}>
        <SpielwieseDashboardShell
          dashboard={dashboard}
          shell={shell}
          variablesState={variablesState}
        >
          <SpielwieseDashboardCanvas
            dashboard={dashboard}
            onDetectedVariablesChange={variablesState.onEnsureDetectedVariables}
          />
        </SpielwieseDashboardShell>
      </SpielwieseVariableValuesProvider>
    </div>
  );
}
