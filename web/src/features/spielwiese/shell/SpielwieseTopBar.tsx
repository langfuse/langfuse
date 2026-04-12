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
import { useSpielwieseShell } from "./SpielwieseShellProvider";

const topBarActionClassName =
  "rounded-md text-foreground/72 hover:bg-black/4 hover:text-foreground";

type SpielwieseTopBarProps = {
  header: SpielwieseDashboardVM["header"];
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
          topBarActionClassName,
        )}
        href="/"
      >
        <div className="bg-foreground text-background grid size-[1.125rem] place-items-center rounded-[4px] text-[0.625rem] font-semibold uppercase">
          {teamInitial}
        </div>
      </Link>
      <Button
        className={cn("min-w-0 gap-1 px-2", topBarActionClassName)}
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
  updatedAt,
  userInitials,
}: {
  toggleSecondarySidebar: () => void;
  updatedAt: string;
  userInitials: string;
}) {
  return (
    <div className="flex h-full items-center gap-1.5">
      <p className="text-foreground/48 hidden text-xs tabular-nums sm:block">
        {updatedAt}
      </p>
      <Avatar className="hidden size-7 rounded-full sm:inline-flex">
        <AvatarFallback className="bg-foreground/6 text-foreground rounded-full text-xs">
          {userInitials}
        </AvatarFallback>
      </Avatar>
      <Button
        className="text-foreground hidden rounded-full px-2 hover:bg-black/4 sm:inline-flex"
        size="sm"
        variant="ghost"
      >
        Share
      </Button>
      <Button
        aria-label="Notifications"
        className={topBarActionClassName}
        size="icon-sm"
        variant="ghost"
      >
        <Bell size={15} />
      </Button>
      <Button
        aria-label="Help"
        className={topBarActionClassName}
        size="icon-sm"
        variant="ghost"
      >
        <CircleHelp size={15} />
      </Button>
      <Button
        aria-label="Toggle secondary sidebar"
        className={topBarActionClassName}
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

export function SpielwieseTopBar({ header, shell }: SpielwieseTopBarProps) {
  const { togglePrimarySidebar, toggleSecondarySidebar } = useSpielwieseShell();

  return (
    <header
      className="top-banner-offset text-foreground sticky z-30 h-[var(--spielwiese-header-height)] w-full bg-[#F3F3F4]"
      data-testid="spielwiese-shell-header"
    >
      <div className="grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-stretch gap-2 px-2.5 pb-0 sm:px-4">
        <HeaderPrimaryActions
          productLabel={shell.productLabel}
          teamInitial={shell.team.initials.slice(0, 1)}
          togglePrimarySidebar={togglePrimarySidebar}
        />
        <div className="min-w-0" />
        <HeaderSecondaryActions
          toggleSecondarySidebar={toggleSecondarySidebar}
          updatedAt={header.updatedAt}
          userInitials={shell.user.initials}
        />
      </div>
    </header>
  );
}
