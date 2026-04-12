import { Bell, PanelLeft, PanelRight } from "lucide-react";
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
const headerDocsHref = "https://langfuse.com/docs";

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

export function SpielwieseTopBar({
  header: _header,
  shell,
}: SpielwieseTopBarProps) {
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
        <div className="min-w-0" />
        <HeaderSecondaryActions
          toggleSecondarySidebar={toggleSecondarySidebar}
          userName={shell.user.name}
          userInitials={shell.user.initials}
        />
      </div>
    </header>
  );
}
