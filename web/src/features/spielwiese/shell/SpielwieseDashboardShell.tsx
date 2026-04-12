/* eslint-disable max-lines */
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import { useSpielwieseVariablesPanelState } from "../components/useSpielwieseVariablesPanelState";
import type { SpielwieseVariablesPanelState } from "../components/useSpielwieseVariablesPanelState";
import type { SpielwieseShellVM } from "../types/shell";
import {
  SpielwieseShellProvider,
  useSpielwieseShell,
} from "./SpielwieseShellProvider";
import type { SpielwieseHeaderFinderProps } from "./SpielwieseHeaderFinder";
import { SpielwieseSidebarLeft } from "./SpielwieseSidebarLeft";
import { SpielwieseSidebarRight } from "./SpielwieseSidebarRight";
import { SpielwieseTopBar } from "./SpielwieseTopBar";

type SpielwieseDashboardShellProps = {
  children: ReactNode;
  dashboard: SpielwieseDashboardVM;
  shell: SpielwieseShellVM;
  variablesState?: SpielwieseVariablesPanelState;
};

function getGridClassName(leftCollapsed: boolean, rightOpen: boolean) {
  if (!rightOpen) {
    return leftCollapsed
      ? "md:grid-cols-[4.75rem_minmax(0,1fr)]"
      : "md:grid-cols-[15.625rem_minmax(0,1fr)]";
  }

  return leftCollapsed
    ? "md:grid-cols-[4.75rem_minmax(0,1fr)] xl:grid-cols-[4.75rem_minmax(0,1fr)_17rem]"
    : "md:grid-cols-[15.625rem_minmax(0,1fr)] xl:grid-cols-[15.625rem_minmax(0,1fr)_17rem]";
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
  variablesState,
}: {
  dashboard: SpielwieseDashboardVM;
  mobileLeftOpen: boolean;
  mobileRightOpen: boolean;
  onClose: () => void;
  shell: SpielwieseShellVM;
  variablesState: SpielwieseVariablesPanelState;
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
          "fixed top-[var(--spielwiese-shell-offset)] right-auto bottom-0 left-0 z-40 w-[15.625rem] max-w-[88vw] bg-[#EEEFF1] transition-transform md:hidden",
          mobileLeftOpen ? "translate-x-0" : "-translate-x-full",
        )}
        data-testid="spielwiese-mobile-left-drawer"
      >
        <SpielwieseSidebarLeft shell={shell} />
      </aside>

      <aside
        className={cn(
          "fixed top-[var(--spielwiese-shell-offset)] right-0 bottom-0 left-auto z-40 w-[20rem] max-w-[88vw] bg-[#F3F3F4] transition-transform xl:hidden",
          mobileRightOpen ? "translate-x-0" : "translate-x-full",
        )}
        data-testid="spielwiese-mobile-right-drawer"
      >
        <SpielwieseSidebarRight
          dashboard={dashboard}
          variablesState={variablesState}
        />
      </aside>
    </>
  );
}

function ShellLeftRail({
  finderProps,
  leftCollapsed,
  shell,
}: {
  finderProps: Omit<SpielwieseHeaderFinderProps, "variant">;
  leftCollapsed: boolean;
  shell: SpielwieseShellVM;
}) {
  return (
    <aside className="hidden min-h-0 md:block">
      <div
        className="box-border h-full min-h-0 bg-[#EEEFF1] pb-2 pl-2 shadow-[inset_8px_0_0_#F3F3F4,inset_0_-8px_0_#F3F3F4]"
        data-testid="spielwiese-shell-left"
      >
        <div className="h-full min-h-0 overflow-hidden rounded-l-[8px]">
          <SpielwieseSidebarLeft
            compact={leftCollapsed}
            finderProps={finderProps}
            shell={shell}
          />
        </div>
      </div>
    </aside>
  );
}

function ShellRightRail({
  dashboard,
  variablesState,
}: {
  dashboard: SpielwieseDashboardVM;
  variablesState: SpielwieseVariablesPanelState;
}) {
  return (
    <aside className="hidden min-h-0 xl:block">
      <div
        className="box-border h-full min-h-0 bg-[#F3F3F4] pr-2 pb-2"
        data-testid="spielwiese-shell-right"
      >
        <div className="h-full min-h-0 overflow-hidden rounded-r-[8px]">
          <SpielwieseSidebarRight
            dashboard={dashboard}
            variablesState={variablesState}
          />
        </div>
      </div>
    </aside>
  );
}

function ShellBodyGrid({
  children,
  dashboard,
  finderProps,
  gridClassName,
  leftCollapsed,
  rightOpen,
  shell,
  variablesState,
}: {
  children: ReactNode;
  dashboard: SpielwieseDashboardVM;
  finderProps: Omit<SpielwieseHeaderFinderProps, "variant">;
  gridClassName: string;
  leftCollapsed: boolean;
  rightOpen: boolean;
  shell: SpielwieseShellVM;
  variablesState: SpielwieseVariablesPanelState;
}) {
  return (
    <div
      className={cn("min-h-0 flex-1 overflow-hidden md:grid", gridClassName)}
      data-testid="spielwiese-shell-body"
    >
      <ShellLeftRail
        finderProps={finderProps}
        leftCollapsed={leftCollapsed}
        shell={shell}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <main
          className="flex min-h-0 flex-1 flex-col overflow-hidden pt-0 pb-0"
          data-testid="spielwiese-shell-main"
        >
          {children}
        </main>
      </div>

      {rightOpen ? (
        <ShellRightRail dashboard={dashboard} variablesState={variablesState} />
      ) : null}
    </div>
  );
}

function useResolvedVariablesState({
  initialItems,
  variablesState,
}: {
  initialItems: SpielwieseDashboardVM["variablesPanel"]["items"];
  variablesState?: SpielwieseVariablesPanelState;
}) {
  const fallbackVariablesState = useSpielwieseVariablesPanelState(initialItems);

  return variablesState ?? fallbackVariablesState;
}

function getFinderProps({
  dashboard,
  isFinderOpen,
  setIsFinderOpen,
  shell,
}: {
  dashboard: SpielwieseDashboardVM;
  isFinderOpen: boolean;
  setIsFinderOpen: (value: boolean) => void;
  shell: SpielwieseShellVM;
}) {
  return {
    breadcrumb: dashboard.header.breadcrumb,
    isOpen: isFinderOpen,
    onClose: () => setIsFinderOpen(false),
    onOpen: () => setIsFinderOpen(true),
    pageId: dashboard.pageId,
    shell,
  };
}

function SmallScreenOverlay() {
  return (
    <div
      className="absolute inset-0 z-50 hidden items-center justify-center bg-white px-6 text-center text-sm font-medium text-[#8B8B8D] max-[499px]:flex"
      data-testid="spielwiese-shell-small-screen-overlay"
    >
      Please view on a larger screen.
    </div>
  );
}

function SpielwieseDashboardShellFrame({
  dashboard,
  finderProps,
  gridClassName,
  leftCollapsed,
  mobileLeftOpen,
  mobileRightOpen,
  onCloseMobilePanels,
  onKeyDownCapture,
  rightOpen,
  shell,
  variablesState,
  children,
}: {
  children: ReactNode;
  dashboard: SpielwieseDashboardVM;
  gridClassName: string;
  leftCollapsed: boolean;
  mobileLeftOpen: boolean;
  mobileRightOpen: boolean;
  onCloseMobilePanels: () => void;
  onKeyDownCapture: (event: KeyboardEvent<HTMLElement>) => void;
  rightOpen: boolean;
  shell: SpielwieseShellVM;
  finderProps: Omit<SpielwieseHeaderFinderProps, "variant">;
  variablesState: SpielwieseVariablesPanelState;
}) {
  return (
    <div
      className="text-foreground h-screen-with-banner relative flex flex-col overflow-hidden bg-[#F3F3F4] [--spielwiese-header-height:2.75rem] [--spielwiese-shell-offset:calc(var(--banner-offset)+var(--spielwiese-header-height))] sm:[--spielwiese-header-height:3rem]"
      data-left-collapsed={leftCollapsed}
      data-right-open={rightOpen}
      data-testid="spielwiese-shell"
      onKeyDownCapture={onKeyDownCapture}
    >
      <SmallScreenOverlay />
      <MobileSidebars
        dashboard={dashboard}
        mobileLeftOpen={mobileLeftOpen}
        mobileRightOpen={mobileRightOpen}
        onClose={onCloseMobilePanels}
        shell={shell}
        variablesState={variablesState}
      />
      <SpielwieseTopBar header={dashboard.header} shell={shell} />
      <ShellBodyGrid
        dashboard={dashboard}
        finderProps={finderProps}
        gridClassName={gridClassName}
        leftCollapsed={leftCollapsed}
        rightOpen={rightOpen}
        shell={shell}
        variablesState={variablesState}
      >
        {children}
      </ShellBodyGrid>
    </div>
  );
}

function SpielwieseDashboardShellLayout({
  children,
  dashboard,
  shell,
  variablesState,
}: SpielwieseDashboardShellProps) {
  const [isFinderOpen, setIsFinderOpen] = useState(false);
  const resolvedVariablesState = useResolvedVariablesState({
    initialItems: dashboard.variablesPanel.items,
    variablesState,
  });
  const {
    closeMobilePanels,
    leftCollapsed,
    mobileLeftOpen,
    mobileRightOpen,
    rightOpen,
  } = useSpielwieseShell();

  return (
    <SpielwieseDashboardShellFrame
      dashboard={dashboard}
      finderProps={getFinderProps({
        dashboard,
        isFinderOpen,
        setIsFinderOpen,
        shell,
      })}
      gridClassName={getGridClassName(leftCollapsed, rightOpen)}
      leftCollapsed={leftCollapsed}
      mobileLeftOpen={mobileLeftOpen}
      mobileRightOpen={mobileRightOpen}
      onCloseMobilePanels={closeMobilePanels}
      onKeyDownCapture={(event) =>
        handleShellKeyDownCapture({
          event,
          isFinderOpen,
          setIsFinderOpen,
        })
      }
      rightOpen={rightOpen}
      shell={shell}
      variablesState={resolvedVariablesState}
    >
      {children}
    </SpielwieseDashboardShellFrame>
  );
}

export function SpielwieseDashboardShell({
  children,
  dashboard,
  shell,
  variablesState,
}: SpielwieseDashboardShellProps) {
  return (
    <SpielwieseShellProvider>
      <SpielwieseDashboardShellLayout
        dashboard={dashboard}
        shell={shell}
        variablesState={variablesState}
      >
        {children}
      </SpielwieseDashboardShellLayout>
    </SpielwieseShellProvider>
  );
}
