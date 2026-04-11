import { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseShellVM } from "../types/shell";

type DocumentPanelTabId = "promptPlayground" | "deployment" | "observability";

const documentPanelTabs: {
  id: DocumentPanelTabId;
  label: string;
  title: string;
  description: string;
}[] = [
  {
    id: "promptPlayground",
    label: "Prompt Engineering",
    title: "Prompt Engineering",
    description:
      "Draft, test, refine, and evaluate prompt behavior before promoting changes.",
  },
  {
    id: "deployment",
    label: "Deployment",
    title: "Deployment",
    description:
      "Promote prompt versions with deployment labels so applications resolve the intended prompt in production.",
  },
  {
    id: "observability",
    label: "Observability",
    title: "Observability",
    description:
      "Inspect traces, sessions, metrics, and scores to understand production behavior and quality.",
  },
];

function DocumentPreviewCard({ shell }: { shell: SpielwieseShellVM }) {
  return (
    <div className="bg-muted/40 flex items-center gap-3 rounded-2xl p-3">
      <div
        aria-hidden="true"
        className="bg-background flex h-14 w-10 shrink-0 flex-col gap-1.5 rounded-lg px-2 py-2"
      >
        <div className="bg-foreground/30 h-1.5 rounded-full" />
        <div className="bg-foreground/30 h-1.5 w-4 rounded-full" />
        <div className="bg-foreground/30 h-1.5 rounded-full" />
        <div className="bg-foreground/30 h-1.5 w-4 rounded-full" />
        <div className="bg-foreground/30 h-1.5 rounded-full" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{shell.workspaceLabel}</p>
        <p className="text-muted-foreground mt-1 text-sm">2 hours ago</p>
      </div>
    </div>
  );
}

export function SpielwieseSidebarDocumentPage({
  shell,
}: {
  shell: SpielwieseShellVM;
}) {
  const [activeTab, setActiveTab] =
    useState<DocumentPanelTabId>("promptPlayground");
  const activePanel =
    documentPanelTabs.find((tab) => tab.id === activeTab) ??
    documentPanelTabs[0];

  return (
    <div className="flex flex-col gap-4 p-3">
      <DocumentPreviewCard shell={shell} />

      <div
        className="bg-muted flex flex-col gap-1 overflow-hidden rounded-2xl p-1"
        data-testid="spielwiese-document-panel-tabs"
      >
        {documentPanelTabs.map((tab) => {
          const isActive = tab.id === activeTab;

          return (
            <button
              aria-label={tab.label}
              aria-pressed={isActive}
              className={cn(
                "text-muted-foreground hover:bg-background hover:text-foreground inline-flex min-h-10 w-full items-center justify-start rounded-xl px-3 text-sm font-medium transition-colors",
                isActive && "bg-background text-foreground shadow-sm",
              )}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="px-2">
        <p
          className="text-sm font-medium"
          data-testid="spielwiese-document-panel-title"
        >
          {activePanel.title}
        </p>
      </div>

      <div className="px-2 py-2">
        <p
          className="text-muted-foreground text-sm text-pretty"
          data-testid="spielwiese-document-panel-description"
        >
          {activePanel.description}
        </p>
      </div>
    </div>
  );
}
