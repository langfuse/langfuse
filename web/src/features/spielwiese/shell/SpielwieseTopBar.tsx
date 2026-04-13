import { useState } from "react";
import { Bell, PanelLeft, PanelRight } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import type { SpielwieseShellVM } from "../types/shell";
import { useSpielwieseShell } from "./SpielwieseShellProvider";
import { SpielwieseWorkspaceSwitcher } from "./SpielwieseWorkspaceSwitcher";

const topBarActionClassName =
  "rounded-md text-foreground/72 hover:bg-black/4 hover:text-foreground";
const topBarPageNavButtonClassName =
  "text-[#242529] border-0 bg-transparent shadow-none transition-colors duration-75 hover:bg-black/[0.06] hover:text-[#242529] active:bg-black/[0.08] h-8 rounded-[0.6rem] px-2.5 text-[0.75rem] font-medium";
const topBarPageNavIconButtonClassName =
  "text-[#242529] size-8 border-0 bg-transparent p-0 shadow-none transition-colors duration-75 hover:bg-black/[0.06] hover:text-[#242529] active:bg-black/[0.08] rounded-[0.6rem]";
const topBarPageNavToggleButtonClassName =
  "text-[#242529] size-8 justify-center rounded-[0.6rem] border-0 bg-transparent p-0 shadow-none transition-colors duration-75 hover:bg-black/[0.06] hover:text-[#242529] active:bg-black/[0.08]";
const topBarProfileButtonClassName =
  "group inline-flex size-10 items-center justify-center rounded-lg transition-[background-color,transform] duration-150 hover:bg-black/[0.05] active:scale-[0.985]";
const topBarCanvasRailClassName =
  "flex min-w-0 w-full items-center gap-3 pl-[5.125rem] pr-2";
const topBarFilePathShellClassName =
  "flex min-w-0 items-center gap-1 py-1 pl-2.5 pr-1";
const topBarModeToggleClassName =
  "pointer-events-auto inline-flex items-center gap-px rounded-[8px] bg-[#F7F7F7] p-0 ring-1 ring-black/5";
const topBarModeToggleButtonClassName =
  "text-foreground/62 hover:text-foreground inline-flex h-6 min-w-24 items-center justify-center gap-1.25 rounded-[8px] px-2 py-0 text-[11px] font-medium tracking-[0.01em] transition-colors outline-none focus-visible:ring-0";
const topBarModeToggleButtonActiveClassName =
  "bg-white text-[#202427] shadow-[0_1px_2px_rgba(15,23,42,0.08)]";
const headerDocsHref = "https://langfuse.com/docs";
const topBarViews = [
  "Agent Composition",
  "Observability",
  "Deployment",
] as const;

type SpielwieseTopBarView = (typeof topBarViews)[number];

type SpielwieseTopBarProps = {
  header: SpielwieseDashboardVM["header"];
  shell: SpielwieseShellVM;
};

function HeaderPrimaryActions({
  teamName,
  togglePrimarySidebar,
}: {
  teamName: string;
  togglePrimarySidebar: () => void;
}) {
  return (
    <div className="flex h-full min-w-0 items-center gap-1.5">
      <SpielwieseWorkspaceSwitcher name={teamName} variant="topbar" />
      <Button
        aria-label="Toggle primary sidebar"
        className={topBarActionClassName}
        data-testid="spielwiese-left-toggle"
        onClick={togglePrimarySidebar}
        size="icon-sm"
        variant="ghost"
      >
        <PanelLeft size={15} />
      </Button>
    </div>
  );
}

function getFilePathSegments(filePath: string) {
  const segments = filePath
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return {
      leaf: filePath,
      root: null,
    };
  }

  const [firstSegment, ...rest] = segments;
  const leaf = rest.join("/") || firstSegment;

  return {
    leaf,
    root: rest.length > 0 ? "Files" : null,
  };
}

function HeaderCanvasRail({ filePath }: { filePath: string }) {
  const [activeView, setActiveView] =
    useState<SpielwieseTopBarView>("Agent Composition");
  const pathSegments = getFilePathSegments(filePath);

  return (
    <div
      className={topBarCanvasRailClassName}
      data-testid="spielwiese-top-bar-canvas-rail"
    >
      <div
        className={topBarFilePathShellClassName}
        data-testid="spielwiese-top-bar-file-path"
      >
        {pathSegments.root ? (
          <>
            <span className="min-w-0 truncate text-[0.75rem] font-medium tracking-[-0.01em] text-[#52545A]">
              {pathSegments.root}
            </span>
            <span
              aria-hidden="true"
              className="shrink-0 text-[0.78rem] leading-none text-[#9A9CA2]"
            >
              ›
            </span>
          </>
        ) : null}
        <span className="min-w-0 truncate text-[0.75rem] font-medium tracking-[-0.01em] text-[#242529]">
          {pathSegments.leaf}
        </span>
      </div>
      <div className="ml-auto shrink-0">
        <div
          className={topBarModeToggleClassName}
          data-testid="spielwiese-top-bar-mode-toggle"
        >
          {topBarViews.map((view) => {
            const isActive = view === activeView;

            return (
              <button
                aria-label={view}
                aria-pressed={isActive}
                className={cn(
                  topBarModeToggleButtonClassName,
                  isActive && topBarModeToggleButtonActiveClassName,
                )}
                key={view}
                onClick={() => setActiveView(view)}
                type="button"
              >
                {view}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HeaderSecondaryActions({
  toggleSecondarySidebar,
  userName,
  userInitials,
}: {
  toggleSecondarySidebar: () => void;
  userName: string;
  userInitials: string;
}) {
  return (
    <div
      className="flex h-full max-h-full w-fit items-center gap-2"
      data-testid="spielwiese-header-secondary-actions"
    >
      <HeaderDesktopActions />
      <Button
        aria-label="Notifications"
        className={topBarPageNavIconButtonClassName}
        size="icon-sm"
        variant="ghost"
      >
        <Bell size={16} />
      </Button>
      <Button
        aria-label="Toggle secondary sidebar"
        className={topBarPageNavToggleButtonClassName}
        data-testid="spielwiese-right-toggle"
        onClick={toggleSecondarySidebar}
        variant="ghost"
      >
        <PanelRight className="size-4 shrink-0" />
      </Button>
      <HeaderProfileButton userInitials={userInitials} userName={userName} />
    </div>
  );
}

function HeaderDesktopActions() {
  return (
    <>
      <Button
        className={`${topBarPageNavButtonClassName} hidden lg:inline-flex`}
        size="sm"
        variant="ghost"
      >
        Share
      </Button>
      <a
        className={`${topBarPageNavButtonClassName} hidden inline-flex items-center justify-center whitespace-nowrap lg:inline-flex`}
        href={headerDocsHref}
        rel="noreferrer"
        target="_blank"
      >
        Docs
      </a>
    </>
  );
}

function HeaderProfileButton({
  userInitials,
  userName,
}: {
  userInitials: string;
  userName: string;
}) {
  return (
    <button
      aria-label="Your profile"
      className={topBarProfileButtonClassName}
      title={userName}
      type="button"
    >
      <Avatar className="size-8 rounded-full">
        <AvatarFallback className="bg-foreground/6 text-foreground rounded-full text-xs">
          {userInitials}
        </AvatarFallback>
      </Avatar>
    </button>
  );
}

export function SpielwieseTopBar({ header, shell }: SpielwieseTopBarProps) {
  const { togglePrimarySidebar, toggleSecondarySidebar } = useSpielwieseShell();

  return (
    <header
      className="top-banner-offset text-foreground sticky z-30 h-[var(--spielwiese-header-height)] w-full bg-[#F3F3F4]"
      data-testid="spielwiese-shell-header"
    >
      <div className="grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-stretch gap-2 px-2.5 pb-0 sm:px-4">
        <HeaderPrimaryActions
          teamName={shell.team.name}
          togglePrimarySidebar={togglePrimarySidebar}
        />
        <div className="flex min-w-0 flex-1 items-center">
          <HeaderCanvasRail filePath={header.filePath} />
        </div>
        <HeaderSecondaryActions
          toggleSecondarySidebar={toggleSecondarySidebar}
          userName={shell.user.name}
          userInitials={shell.user.initials}
        />
      </div>
    </header>
  );
}
