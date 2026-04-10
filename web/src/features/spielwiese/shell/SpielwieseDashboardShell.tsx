import type { ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import type { SpielwieseShellVM } from "../types/shell";
import {
  SpielwieseShellProvider,
  useSpielwieseShell,
} from "./SpielwieseShellProvider";
import { SpielwieseSidebarLeft } from "./SpielwieseSidebarLeft";
import { SpielwieseSidebarRight } from "./SpielwieseSidebarRight";
import { SpielwieseTopBar } from "./SpielwieseTopBar";

type SpielwieseDashboardShellProps = {
  children: ReactNode;
  dashboard: SpielwieseDashboardVM;
  shell: SpielwieseShellVM;
};

function getGridClassName(leftCollapsed: boolean, rightOpen: boolean) {
  if (!rightOpen) {
    return leftCollapsed
      ? "md:grid-cols-[4.75rem_minmax(0,1fr)]"
      : "md:grid-cols-[14rem_minmax(0,1fr)]";
  }

  return leftCollapsed
    ? "md:grid-cols-[4.75rem_minmax(0,1fr)] xl:grid-cols-[4.75rem_minmax(0,1fr)_17rem]"
    : "md:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_17rem]";
}

function MobileSidebars({
  dashboard,
  mobileLeftOpen,
  mobileRightOpen,
  onClose,
  shell,
}: {
  dashboard: SpielwieseDashboardVM;
  mobileLeftOpen: boolean;
  mobileRightOpen: boolean;
  onClose: () => void;
  shell: SpielwieseShellVM;
}) {
  return (
    <>
      {mobileLeftOpen || mobileRightOpen ? (
        <button
          aria-label="Close mobile sidebars"
          className="bg-background/80 fixed inset-x-0 top-[var(--spielwiese-shell-offset)] bottom-0 z-30 md:hidden"
          data-testid="spielwiese-mobile-backdrop"
          onClick={onClose}
          type="button"
        />
      ) : null}

      <aside
        className={cn(
          "border-sidebar-border bg-sidebar fixed top-[var(--spielwiese-shell-offset)] right-auto bottom-0 left-0 z-40 w-[18rem] max-w-[88vw] border-r transition-transform md:hidden",
          mobileLeftOpen ? "translate-x-0" : "-translate-x-full",
        )}
        data-testid="spielwiese-mobile-left-drawer"
      >
        <SpielwieseSidebarLeft shell={shell} />
      </aside>

      <aside
        className={cn(
          "border-sidebar-border bg-sidebar fixed top-[var(--spielwiese-shell-offset)] right-0 bottom-0 left-auto z-40 w-[20rem] max-w-[88vw] border-l transition-transform xl:hidden",
          mobileRightOpen ? "translate-x-0" : "translate-x-full",
        )}
        data-testid="spielwiese-mobile-right-drawer"
      >
        <SpielwieseSidebarRight dashboard={dashboard} />
      </aside>
    </>
  );
}

function SpielwieseDashboardShellLayout({
  children,
  dashboard,
  shell,
}: SpielwieseDashboardShellProps) {
  const {
    closeMobilePanels,
    leftCollapsed,
    mobileLeftOpen,
    mobileRightOpen,
    rightOpen,
  } = useSpielwieseShell();

  const gridClassName = getGridClassName(leftCollapsed, rightOpen);

  return (
    <div
      className="bg-background text-foreground h-screen-with-banner flex flex-col overflow-hidden [--spielwiese-header-height:3.75rem] [--spielwiese-shell-offset:calc(var(--banner-offset)+var(--spielwiese-header-height))] sm:[--spielwiese-header-height:4rem]"
      data-left-collapsed={leftCollapsed}
      data-right-open={rightOpen}
      data-testid="spielwiese-shell"
    >
      <MobileSidebars
        dashboard={dashboard}
        mobileLeftOpen={mobileLeftOpen}
        mobileRightOpen={mobileRightOpen}
        onClose={closeMobilePanels}
        shell={shell}
      />

      <SpielwieseTopBar header={dashboard.header} shell={shell} />

      <div
        className={cn("min-h-0 flex-1 overflow-hidden md:grid", gridClassName)}
        data-testid="spielwiese-shell-body"
      >
        <aside className="hidden min-h-0 md:block">
          <div className="h-full min-h-0" data-testid="spielwiese-shell-left">
            <SpielwieseSidebarLeft compact={leftCollapsed} shell={shell} />
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main
            className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-3 pb-0 sm:px-5 sm:pt-4"
            data-testid="spielwiese-shell-main"
          >
            {children}
          </main>
        </div>

        {rightOpen ? (
          <aside className="hidden min-h-0 xl:block">
            <div
              className="h-full min-h-0"
              data-testid="spielwiese-shell-right"
            >
              <SpielwieseSidebarRight dashboard={dashboard} />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function SpielwieseDashboardShell({
  children,
  dashboard,
  shell,
}: SpielwieseDashboardShellProps) {
  return (
    <SpielwieseShellProvider>
      <SpielwieseDashboardShellLayout dashboard={dashboard} shell={shell}>
        {children}
      </SpielwieseDashboardShellLayout>
    </SpielwieseShellProvider>
  );
}
