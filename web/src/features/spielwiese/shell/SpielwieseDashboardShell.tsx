import { useState, type KeyboardEvent, type ReactNode } from "react";
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

function isEditableEventTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

function shouldOpenFinderFromKeydown(
  event: KeyboardEvent<HTMLElement>,
  isFinderOpen: boolean,
) {
  return (
    !isFinderOpen &&
    event.key.toLowerCase() === "f" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !isEditableEventTarget(event.target)
  );
}

function handleShellKeyDownCapture({
  event,
  isFinderOpen,
  setIsFinderOpen,
}: {
  event: KeyboardEvent<HTMLElement>;
  isFinderOpen: boolean;
  setIsFinderOpen: (value: boolean) => void;
}) {
  if (shouldOpenFinderFromKeydown(event, isFinderOpen)) {
    event.preventDefault();
    setIsFinderOpen(true);
  }
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
          className="fixed inset-x-0 top-[var(--spielwiese-shell-offset)] bottom-0 z-30 bg-[#F5F5F5]/80 md:hidden"
          data-testid="spielwiese-mobile-backdrop"
          onClick={onClose}
          type="button"
        />
      ) : null}

      <aside
        className={cn(
          "fixed top-[var(--spielwiese-shell-offset)] right-auto bottom-0 left-0 z-40 w-[18rem] max-w-[88vw] bg-[#FBFBFB] transition-transform md:hidden",
          mobileLeftOpen ? "translate-x-0" : "-translate-x-full",
        )}
        data-testid="spielwiese-mobile-left-drawer"
      >
        <SpielwieseSidebarLeft shell={shell} />
      </aside>

      <aside
        className={cn(
          "fixed top-[var(--spielwiese-shell-offset)] right-0 bottom-0 left-auto z-40 w-[20rem] max-w-[88vw] bg-[#FBFBFB] transition-transform xl:hidden",
          mobileRightOpen ? "translate-x-0" : "translate-x-full",
        )}
        data-testid="spielwiese-mobile-right-drawer"
      >
        <SpielwieseSidebarRight dashboard={dashboard} />
      </aside>
    </>
  );
}

function ShellBodyGrid({
  children,
  dashboard,
  gridClassName,
  leftCollapsed,
  rightOpen,
  shell,
}: {
  children: ReactNode;
  dashboard: SpielwieseDashboardVM;
  gridClassName: string;
  leftCollapsed: boolean;
  rightOpen: boolean;
  shell: SpielwieseShellVM;
}) {
  return (
    <div
      className={cn("min-h-0 flex-1 overflow-hidden md:grid", gridClassName)}
      data-testid="spielwiese-shell-body"
    >
      <aside className="hidden min-h-0 md:block">
        <div
          className="box-border h-full min-h-0 bg-[#15181C] pt-2"
          data-testid="spielwiese-shell-left"
        >
          <div className="h-full min-h-0 overflow-hidden rounded-t-[8px]">
            <SpielwieseSidebarLeft compact={leftCollapsed} shell={shell} />
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <main
          className="flex min-h-0 flex-1 flex-col overflow-hidden pt-0 pb-0"
          data-testid="spielwiese-shell-main"
        >
          {children}
        </main>
      </div>

      {rightOpen ? (
        <aside className="hidden min-h-0 xl:block">
          <div
            className="box-border h-full min-h-0 bg-[#15181C] pt-2"
            data-testid="spielwiese-shell-right"
          >
            <div className="h-full min-h-0 overflow-hidden rounded-t-[8px]">
              <SpielwieseSidebarRight dashboard={dashboard} />
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function SpielwieseDashboardShellLayout({
  children,
  dashboard,
  shell,
}: SpielwieseDashboardShellProps) {
  const [isFinderOpen, setIsFinderOpen] = useState(false);
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
      className="text-foreground h-screen-with-banner flex flex-col overflow-hidden bg-[#F5F5F5] [--spielwiese-header-height:2.75rem] [--spielwiese-shell-offset:calc(var(--banner-offset)+var(--spielwiese-header-height))] sm:[--spielwiese-header-height:3rem]"
      data-left-collapsed={leftCollapsed}
      data-right-open={rightOpen}
      data-testid="spielwiese-shell"
      onKeyDownCapture={(event) =>
        handleShellKeyDownCapture({
          event,
          isFinderOpen,
          setIsFinderOpen,
        })
      }
    >
      <MobileSidebars
        dashboard={dashboard}
        mobileLeftOpen={mobileLeftOpen}
        mobileRightOpen={mobileRightOpen}
        onClose={closeMobilePanels}
        shell={shell}
      />

      <SpielwieseTopBar
        header={dashboard.header}
        isFinderOpen={isFinderOpen}
        onFinderClose={() => setIsFinderOpen(false)}
        onFinderOpen={() => setIsFinderOpen(true)}
        pageId={dashboard.pageId}
        shell={shell}
      />

      <ShellBodyGrid
        dashboard={dashboard}
        gridClassName={gridClassName}
        leftCollapsed={leftCollapsed}
        rightOpen={rightOpen}
        shell={shell}
      >
        {children}
      </ShellBodyGrid>
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
