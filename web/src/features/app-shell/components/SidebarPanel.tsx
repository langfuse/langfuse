import { type ReactNode } from "react";
import {
  APP_SHELL_CHROME_ROW_CLASS,
  APP_SHELL_CHROME_ROW_TEST_ID,
} from "@/src/components/layouts/app-shell-chrome";
import { cn } from "@/src/utils/tailwind";

function SidebarPanelRoot({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 w-full flex-col">{children}</div>;
}

/** Same height and divider as the page header's first row, so the two line up when docked. */
function SidebarPanelHeader({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid={APP_SHELL_CHROME_ROW_TEST_ID}
      className={cn(
        APP_SHELL_CHROME_ROW_CLASS,
        "min-w-0 shrink-0 gap-1 pr-2 pl-3",
      )}
    >
      {children}
    </div>
  );
}

function SidebarPanelSection({ children }: { children: ReactNode }) {
  return <div className="shrink-0 px-2 pt-2">{children}</div>;
}

function SidebarPanelBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-1.5">
      {children}
    </div>
  );
}

function SidebarPanelSpacer() {
  return <div className="flex-1" aria-hidden="true" />;
}

function SidebarPanelFooter({ children }: { children: ReactNode }) {
  return (
    <div className="border-sidebar-border shrink-0 border-t p-2">
      {children}
    </div>
  );
}

/** Layout slots of the sidebar panel; the same panel renders docked, floating, and in the mobile drawer. */
export const SidebarPanel = Object.assign(SidebarPanelRoot, {
  Header: SidebarPanelHeader,
  Section: SidebarPanelSection,
  Body: SidebarPanelBody,
  Spacer: SidebarPanelSpacer,
  Footer: SidebarPanelFooter,
});
