import { FileText, FolderClosed } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import type { SpielwieseFooterTool, SpielwieseShellVM } from "../types/shell";

export function UsageMeter({ shell }: { shell: SpielwieseShellVM }) {
  const progress = Math.min(100, (shell.usage.used / shell.usage.limit) * 100);

  return (
    <div className="bg-muted/35 flex flex-col gap-3 rounded-2xl p-3">
      <p className="text-sm font-medium">{shell.usage.label}</p>
      <div className="bg-border h-2 overflow-hidden rounded-full">
        <div
          className="bg-foreground h-full rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-muted-foreground text-sm">
        {shell.usage.used} of {shell.usage.limit} blocks used
      </p>
      <Button className="w-full rounded-xl">{shell.usage.ctaLabel}</Button>
    </div>
  );
}

export function FooterTools({
  compact,
  tools,
}: {
  compact: boolean;
  tools: SpielwieseFooterTool[];
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 pt-3",
        compact && "w-full flex-col items-start gap-0.5 px-2 pt-0",
      )}
    >
      {tools.map((tool) => {
        const Icon = tool.icon;

        return (
          <a
            key={tool.id}
            className={cn(
              "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground inline-flex size-9 items-center justify-center rounded-xl transition-colors",
              compact &&
                "size-7 justify-center rounded-[9px] px-0 text-[0.875rem] text-black/[0.55] hover:bg-black/[0.06] hover:text-[#242529]",
            )}
            href={tool.href}
            title={tool.label}
          >
            <Icon className="size-4" />
          </a>
        );
      })}
    </div>
  );
}

type SidebarViewMode = "folders" | "document";

export function SidebarBottomModeSwitch({
  activeMode,
  onModeChange,
}: {
  activeMode: SidebarViewMode;
  onModeChange: (mode: SidebarViewMode) => void;
}) {
  return (
    <div
      className="bg-muted flex items-center overflow-hidden rounded-2xl p-1"
      data-testid="spielwiese-left-bottom-mode-switch"
    >
      <button
        aria-label="Folder view"
        aria-pressed={activeMode === "folders"}
        className={cn(
          "text-muted-foreground hover:bg-background hover:text-foreground inline-flex h-10 flex-1 items-center justify-center rounded-l-xl rounded-r-none transition-colors",
          activeMode === "folders" && "bg-background text-foreground shadow-sm",
        )}
        onClick={() => onModeChange("folders")}
        type="button"
      >
        <FolderClosed className="size-5" />
      </button>
      <button
        aria-label="Document view"
        aria-pressed={activeMode === "document"}
        className={cn(
          "text-muted-foreground hover:bg-background hover:text-foreground inline-flex h-10 flex-1 items-center justify-center rounded-l-none rounded-r-xl transition-colors",
          activeMode === "document" &&
            "bg-background text-foreground shadow-sm",
        )}
        onClick={() => onModeChange("document")}
        type="button"
      >
        <FileText className="size-5" />
      </button>
    </div>
  );
}
