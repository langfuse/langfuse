import { useSyncExternalStore } from "react";
import {
  getSpielwieseDashboardVm,
  getSpielwieseShellVm,
} from "../adapters/dashboardVm";
import { SpielwieseEditorCanvas } from "../components/SpielwieseEditorCanvas";
import { SpielwiesePromptCanvas } from "../components/SpielwiesePromptCanvas";
import { SpielwieseDashboardShell } from "../shell/SpielwieseDashboardShell";
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
}: {
  dashboard: SpielwieseDashboardVM;
}) {
  if (dashboard.promptCanvas) {
    return <SpielwiesePromptCanvas promptCanvas={dashboard.promptCanvas} />;
  }

  return <SpielwieseEditorCanvas canvas={dashboard.canvas} />;
}

export default function SpielwieseDashboardPage() {
  const pageId = useSyncExternalStore(
    subscribeToHash,
    getPageIdFromHash,
    () => "assistant",
  );
  const dashboard = getSpielwieseDashboardVm(pageId);
  const shell = getSpielwieseShellVm(pageId);

  return (
    <div
      className="isolate min-h-dvh [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased"
      data-spielwiese
    >
      <SpielwieseDashboardShell dashboard={dashboard} shell={shell}>
        <SpielwieseDashboardCanvas dashboard={dashboard} />
      </SpielwieseDashboardShell>
    </div>
  );
}
