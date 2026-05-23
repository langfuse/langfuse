import { useRef, useState, useSyncExternalStore } from "react";
import { getSpielwieseShellVm } from "../adapters/dashboardVm";
import { SpielwieseEditorCanvas } from "../components/SpielwieseEditorCanvas";
import { SpielwiesePromptCanvas } from "../components/SpielwiesePromptCanvas";
import { SpielwieseVariableValuesProvider } from "../components/useSpielwieseVariableValues";
import { useSpielwieseVariablesPanelState } from "../components/useSpielwieseVariablesPanelState";
import { SpielwieseOnboardingDashboardTransition } from "../onboarding/components/SpielwieseOnboardingDashboardTransition";
import { consumeOnboardingDashboardHandoff } from "../onboarding/spielwieseOnboardingDashboardHandoff";
import { SpielwieseDashboardShell } from "../shell/SpielwieseDashboardShell";
import { useSpielwieseShell } from "../shell/SpielwieseShellProvider";
import {
  getDashboardWithOnboardingHandoff,
  spielwieseDashboardRootClassName,
  spielwieseDashboardRootStyle,
} from "../spielwieseDashboardRoleFlow";
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
  const [onboardingHandoff] = useState(() =>
    typeof window === "undefined" ? null : consumeOnboardingDashboardHandoff(),
  );
  const dashboard = getDashboardWithOnboardingHandoff({
    handoff: onboardingHandoff,
    pageId,
  });
  const shell = getSpielwieseShellVm(pageId);
  const variablesState = useSpielwieseVariablesPanelState(
    dashboard.variablesPanel.items,
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      className={spielwieseDashboardRootClassName}
      data-spielwiese
      ref={rootRef}
      style={spielwieseDashboardRootStyle}
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
        {onboardingHandoff?.transitionKind === "role-flow" ? (
          <SpielwieseOnboardingDashboardTransition
            detachedUserDeckTestId="vision-agent-detached-user-sections"
            rootRef={rootRef}
            targetNodeId="vision-agent"
          />
        ) : null}
      </SpielwieseVariableValuesProvider>
    </div>
  );
}
