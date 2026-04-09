import { useSyncExternalStore } from "react";
import {
  getSpielwieseDashboardVm,
  getSpielwieseShellVm,
} from "../adapters/dashboardVm";
import { SpielwieseEditorCanvas } from "../components/SpielwieseEditorCanvas";
import { SpielwiesePromptCanvas } from "../components/SpielwiesePromptCanvas";
import { SpielwieseDashboardShell } from "../shell/SpielwieseDashboardShell";

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

export default function SpielwieseDashboardPage() {
  const pageId = useSyncExternalStore(
    subscribeToHash,
    getPageIdFromHash,
    () => "assistant",
  );
  const shell = getSpielwieseShellVm(pageId);
  const dashboard = getSpielwieseDashboardVm(pageId);

  return (
    <div className="isolate min-h-dvh antialiased" data-spielwiese>
      <SpielwieseDashboardShell dashboard={dashboard} shell={shell}>
        {dashboard.promptCanvas ? (
          <SpielwiesePromptCanvas promptCanvas={dashboard.promptCanvas} />
        ) : (
          <SpielwieseEditorCanvas canvas={dashboard.canvas} />
        )}
      </SpielwieseDashboardShell>
    </div>
  );
}
