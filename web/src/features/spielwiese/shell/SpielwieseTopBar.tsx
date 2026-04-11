import Link from "next/link";
import {
  Bell,
  ChevronDown,
  CircleHelp,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button, buttonVariants } from "../ui/button";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import type { SpielwieseShellVM } from "../types/shell";
import { SpielwieseHeaderFinder } from "./SpielwieseHeaderFinder";
import { useSpielwieseShell } from "./SpielwieseShellProvider";

type SpielwieseTopBarProps = {
  header: SpielwieseDashboardVM["header"];
  isFinderOpen: boolean;
  onFinderClose: () => void;
  onFinderOpen: () => void;
  pageId: SpielwieseDashboardVM["pageId"];
  shell: SpielwieseShellVM;
};

function HeaderPrimaryActions({
  productLabel,
  teamInitial,
  togglePrimarySidebar,
}: {
  productLabel: string;
  teamInitial: string;
  togglePrimarySidebar: () => void;
}) {
  return (
    <div className="flex h-full min-w-0 items-center gap-1.5">
      <Link
        aria-label="Homepage"
        className={cn(
          buttonVariants({ size: "icon-sm", variant: "ghost" }),
          "rounded-md text-white/82 hover:bg-white/8 hover:text-white",
        )}
        href="/"
      >
        <div className="bg-foreground text-background grid size-[1.125rem] place-items-center rounded-[4px] text-[0.625rem] font-semibold uppercase">
          {teamInitial}
        </div>
      </Link>
      <Button
        className="min-w-0 gap-1 rounded-md px-2 text-white/82 hover:bg-white/8 hover:text-white"
        size="sm"
        variant="ghost"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-[13px] font-medium">{productLabel}</p>
          <ChevronDown size={13} />
        </div>
      </Button>
      <Button
        aria-label="Toggle primary sidebar"
        className="rounded-md text-white/82 hover:bg-white/8 hover:text-white"
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
  updatedAt,
  userInitials,
}: {
  toggleSecondarySidebar: () => void;
  updatedAt: string;
  userInitials: string;
}) {
  return (
    <div className="flex h-full items-center gap-1.5">
      <p className="hidden text-xs text-white/48 tabular-nums sm:block">
        {updatedAt}
      </p>
      <Avatar className="hidden size-7 rounded-full sm:inline-flex">
        <AvatarFallback className="rounded-full bg-white/10 text-xs text-white">
          {userInitials}
        </AvatarFallback>
      </Avatar>
      <Button
        className="hidden rounded-full px-2 text-white/82 hover:bg-white/8 hover:text-white sm:inline-flex"
        size="sm"
        variant="ghost"
      >
        Share
      </Button>
      <Button
        aria-label="Notifications"
        className="rounded-md text-white/82 hover:bg-white/8 hover:text-white"
        size="icon-sm"
        variant="ghost"
      >
        <Bell size={15} />
      </Button>
      <Button
        aria-label="Help"
        className="rounded-md text-white/82 hover:bg-white/8 hover:text-white"
        size="icon-sm"
        variant="ghost"
      >
        <CircleHelp size={15} />
      </Button>
      <Button
        aria-label="Toggle secondary sidebar"
        className="rounded-md text-white/82 hover:bg-white/8 hover:text-white"
        data-testid="spielwiese-right-toggle"
        onClick={toggleSecondarySidebar}
        size="icon-sm"
        variant="ghost"
      >
        <PanelRight size={15} />
      </Button>
    </div>
  );
}

export function SpielwieseTopBar({
  header,
  isFinderOpen,
  onFinderClose,
  onFinderOpen,
  pageId,
  shell,
}: SpielwieseTopBarProps) {
  const { togglePrimarySidebar, toggleSecondarySidebar } = useSpielwieseShell();

  return (
    <header
      className="top-banner-offset sticky z-30 h-[var(--spielwiese-header-height)] w-full bg-[#15181C] text-white"
      data-testid="spielwiese-shell-header"
    >
      <div className="grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-stretch gap-2 px-2.5 pb-0 sm:px-4">
        <HeaderPrimaryActions
          productLabel={shell.productLabel}
          teamInitial={shell.team.initials.slice(0, 1)}
          togglePrimarySidebar={togglePrimarySidebar}
        />
        <SpielwieseHeaderFinder
          breadcrumb={header.breadcrumb}
          isOpen={isFinderOpen}
          onClose={onFinderClose}
          onOpen={onFinderOpen}
          pageId={pageId}
          shell={shell}
        />
        <HeaderSecondaryActions
          toggleSecondarySidebar={toggleSecondarySidebar}
          updatedAt={header.updatedAt}
          userInitials={shell.user.initials}
        />
      </div>
    </header>
  );
}
