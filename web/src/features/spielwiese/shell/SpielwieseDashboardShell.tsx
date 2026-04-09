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
      ? "md:grid-cols-[5rem_minmax(0,1fr)]"
      : "md:grid-cols-[18rem_minmax(0,1fr)]";
  }

  return leftCollapsed
    ? "md:grid-cols-[5rem_minmax(0,1fr)] xl:grid-cols-[5rem_minmax(0,1fr)_21rem]"
    : "md:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)_21rem]";
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
          className="bg-foreground/10 fixed inset-0 z-30 md:hidden"
          onClick={onClose}
          type="button"
        />
      ) : null}

      <aside
        className={cn(
          "border-sidebar-border/70 bg-sidebar fixed inset-y-0 left-0 z-40 w-[18rem] max-w-[88vw] border-r transition-transform md:hidden",
          mobileLeftOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SpielwieseSidebarLeft shell={shell} />
      </aside>

      <aside
        className={cn(
          "border-sidebar-border/70 bg-sidebar fixed inset-y-0 right-0 z-40 w-[20rem] max-w-[88vw] border-l transition-transform xl:hidden",
          mobileRightOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <SpielwieseSidebarRight dashboard={dashboard} shell={shell} />
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
      className="bg-background text-foreground min-h-dvh"
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

      <div className={cn("min-h-dvh md:grid", gridClassName)}>
        <aside className="hidden min-h-dvh md:block">
          <div className="sticky top-0 h-dvh">
            <SpielwieseSidebarLeft compact={leftCollapsed} shell={shell} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <SpielwieseTopBar header={dashboard.header} shell={shell} />
          <main className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
            {children}
          </main>
        </div>

        {rightOpen ? (
          <aside className="hidden min-h-dvh xl:block">
            <div className="sticky top-0 h-dvh">
              <SpielwieseSidebarRight dashboard={dashboard} shell={shell} />
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
