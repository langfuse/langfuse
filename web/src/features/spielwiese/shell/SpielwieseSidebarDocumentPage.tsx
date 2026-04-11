import { CircleCheckBig, List, Paperclip, Search } from "lucide-react";
import { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseShellVM } from "../types/shell";

type DocumentPanelTabId = "outline" | "tasks" | "attachments" | "search";

const documentPanelTabs: {
  id: DocumentPanelTabId;
  label: string;
  icon: typeof List;
  title: string;
  description: string;
}[] = [
  {
    id: "outline",
    label: "Table of contents",
    icon: List,
    title: "Table of Contents",
    description: "Use titles, pages or cards to create a table of contents.",
  },
  {
    id: "tasks",
    label: "Checklist",
    icon: CircleCheckBig,
    title: "Checklist",
    description:
      "Create tasks in the page to turn this area into an action list.",
  },
  {
    id: "attachments",
    label: "Attachments",
    icon: Paperclip,
    title: "Attachments",
    description: "Add files, media, or embeds to collect them here.",
  },
  {
    id: "search",
    label: "Search in page",
    icon: Search,
    title: "Search in Page",
    description:
      "Search highlights, questions, or key phrases across this page.",
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
  const [activeTab, setActiveTab] = useState<DocumentPanelTabId>("outline");
  const activePanel =
    documentPanelTabs.find((tab) => tab.id === activeTab) ??
    documentPanelTabs[0];

  return (
    <div className="flex flex-col gap-4 p-3">
      <DocumentPreviewCard shell={shell} />

      <div
        className="bg-muted flex items-center overflow-hidden rounded-2xl p-1"
        data-testid="spielwiese-document-panel-tabs"
      >
        {documentPanelTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === activeTab;

          return (
            <button
              aria-label={tab.label}
              aria-pressed={isActive}
              className={cn(
                "text-muted-foreground hover:bg-background hover:text-foreground inline-flex h-10 flex-1 items-center justify-center rounded-xl transition-colors",
                isActive && "bg-background text-foreground shadow-sm",
              )}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <Icon className="size-5" />
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
