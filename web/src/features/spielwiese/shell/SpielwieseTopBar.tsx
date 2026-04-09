import { PanelLeft, PanelRight } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../ui/breadcrumb";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import type { SpielwieseShellVM } from "../types/shell";
import { useSpielwieseShell } from "./SpielwieseShellProvider";

type SpielwieseTopBarProps = {
  header: SpielwieseDashboardVM["header"];
  shell: SpielwieseShellVM;
};

function SpielwieseTopBarBreadcrumbs({ shell }: { shell: SpielwieseShellVM }) {
  return (
    <Breadcrumb className="mb-1">
      <BreadcrumbList>
        <BreadcrumbItem>{shell.productLabel}</BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>{shell.workspaceLabel}</BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Dashboard</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function DesktopRailControls({ onToggle }: { onToggle: () => void }) {
  return (
    <div className="hidden items-center gap-3 sm:flex">
      <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-sm font-medium">
        shadcn preset `b1D0eCA7`
      </span>
      <Button
        aria-label="Toggle secondary sidebar"
        data-testid="spielwiese-right-toggle"
        onClick={onToggle}
        size="icon-sm"
        variant="outline"
      >
        <PanelRight size={16} />
      </Button>
    </div>
  );
}

export function SpielwieseTopBar({ header, shell }: SpielwieseTopBarProps) {
  const { togglePrimarySidebar, toggleSecondarySidebar } = useSpielwieseShell();

  return (
    <header className="border-border/60 bg-background/90 sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-4 backdrop-blur-sm sm:px-6">
      <Button
        aria-label="Toggle primary sidebar"
        data-testid="spielwiese-left-toggle"
        onClick={togglePrimarySidebar}
        size="icon-sm"
        variant="ghost"
      >
        <PanelLeft size={16} />
      </Button>
      <Separator className="hidden sm:block" orientation="vertical" />
      <div className="min-w-0 flex-1">
        <SpielwieseTopBarBreadcrumbs shell={shell} />
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-muted-foreground truncate text-sm font-medium tracking-[0.18em] uppercase">
              {header.eyebrow}
            </p>
            <h1 className="truncate text-lg font-semibold sm:text-xl">
              {shell.workspaceLabel} dashboard
            </h1>
          </div>
          <DesktopRailControls onToggle={toggleSecondarySidebar} />
        </div>
      </div>
      <Button
        aria-label="Toggle secondary sidebar"
        className="sm:hidden"
        data-testid="spielwiese-right-toggle-mobile"
        onClick={toggleSecondarySidebar}
        size="icon-sm"
        variant="ghost"
      >
        <PanelRight size={16} />
      </Button>
    </header>
  );
}
