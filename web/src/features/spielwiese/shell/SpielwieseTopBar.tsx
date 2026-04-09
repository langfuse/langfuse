import Link from "next/link";
import {
  Bell,
  ChevronDown,
  CircleHelp,
  PanelLeft,
  PanelRight,
  Search,
} from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button, buttonVariants } from "../ui/button";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import type { SpielwieseShellVM } from "../types/shell";
import { useSpielwieseShell } from "./SpielwieseShellProvider";

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
    <div className="flex min-w-0 items-center gap-2">
      <Link
        aria-label="Homepage"
        className={cn(
          buttonVariants({ size: "icon-sm", variant: "ghost" }),
          "rounded-lg",
        )}
        href="/"
      >
        <div className="bg-foreground text-background grid size-5 place-items-center rounded-sm text-[0.6875rem] font-semibold uppercase">
          {teamInitial}
        </div>
      </Link>
      <Button
        className="min-w-0 gap-1.5 rounded-lg px-2.5"
        size="default"
        variant="ghost"
      >
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium">{productLabel}</p>
          <ChevronDown size={14} />
        </div>
      </Button>
      <Button
        aria-label="Toggle primary sidebar"
        data-testid="spielwiese-left-toggle"
        onClick={togglePrimarySidebar}
        size="icon-sm"
        variant="ghost"
      >
        <PanelLeft size={16} />
      </Button>
    </div>
  );
}

function HeaderBreadcrumb({
  breadcrumb,
}: {
  breadcrumb: SpielwieseDashboardVM["header"]["breadcrumb"];
}) {
  return (
    <div className="flex min-w-0 justify-center">
      <div className="bg-muted/55 border-border/70 flex h-9 min-w-0 items-center gap-2 rounded-full border px-3 sm:max-w-[28rem] sm:px-4">
        <Search className="text-muted-foreground shrink-0" size={15} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{breadcrumb}</p>
        </div>
      </div>
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
    <div className="flex items-center gap-2">
      <p className="text-muted-foreground hidden text-sm tabular-nums sm:block">
        {updatedAt}
      </p>
      <Avatar className="hidden size-8 rounded-full sm:inline-flex">
        <AvatarFallback className="rounded-full text-xs">
          {userInitials}
        </AvatarFallback>
      </Avatar>
      <Button
        className="hidden rounded-full sm:inline-flex"
        size="sm"
        variant="outline"
      >
        Share
      </Button>
      <Button aria-label="Notifications" size="icon-sm" variant="ghost">
        <Bell size={16} />
      </Button>
      <Button aria-label="Help" size="icon-sm" variant="ghost">
        <CircleHelp size={16} />
      </Button>
      <Button
        aria-label="Toggle secondary sidebar"
        data-testid="spielwiese-right-toggle"
        onClick={toggleSecondarySidebar}
        size="icon-sm"
        variant="ghost"
      >
        <PanelRight size={16} />
      </Button>
    </div>
  );
}

export function SpielwieseTopBar({ header, shell }: SpielwieseTopBarProps) {
  const { togglePrimarySidebar, toggleSecondarySidebar } = useSpielwieseShell();

  return (
    <header
      className="bg-background top-banner-offset sticky z-30 h-[var(--spielwiese-header-height)] w-full border-b"
      data-testid="spielwiese-shell-header"
    >
      <div className="grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 sm:px-5">
        <HeaderPrimaryActions
          productLabel={shell.productLabel}
          teamInitial={shell.team.initials.slice(0, 1)}
          togglePrimarySidebar={togglePrimarySidebar}
        />
        <HeaderBreadcrumb breadcrumb={header.breadcrumb} />
        <HeaderSecondaryActions
          toggleSecondarySidebar={toggleSecondarySidebar}
          updatedAt={header.updatedAt}
          userInitials={shell.user.initials}
        />
      </div>
    </header>
  );
}
