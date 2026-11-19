import { type ReactNode } from "react";
import useSessionStorage from "@/src/components/useSessionStorage";
import { PanelLeftClose, PanelLeftOpen, Search } from "@langfuse/icons";
import { Button as IconButton } from "@/src/components/ui/button";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { ResizableSplitLayout } from "@/src/components/ui/ResizableSplitLayout";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
} from "@/src/components/ui/resizable";
import { useElementSize } from "@/src/hooks/useElementSize";

export function SessionViewLayout({
  renderSidebar,
  search,
  isLoading,
  children,
  sidebarMode,
}: {
  renderSidebar: (
    onNavigate: () => void,
    sidebarToggle?: ReactNode,
  ) => ReactNode;
  search: string;
  isLoading: boolean;
  children: ReactNode;
  sidebarMode: "fixed" | "collapsible";
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useSessionStorage(
    "annotation-session-conversation-sidebar:open",
    true,
  );
  const [workspaceRef, workspaceSize] = useElementSize<HTMLDivElement>();
  const showSidebar = (workspaceSize?.width ?? 0) >= 768;
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "session-conversation-sidebar",
    panelIds: ["sidebar", "timeline"],
    storage: "session",
  });
  const sidebarToggle = (
    <Tooltip
      label={isSidebarOpen ? "Hide session sidebar" : "Show session sidebar"}
      placement={isSidebarOpen ? "top" : "right"}
    >
      {({ getTriggerProps }) => (
        <IconButton
          {...getTriggerProps()}
          variant="ghost"
          size="icon"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          aria-label={
            isSidebarOpen ? "Hide session sidebar" : "Show session sidebar"
          }
          aria-expanded={isSidebarOpen}
          className="h-6 w-6 shrink-0"
        >
          {isSidebarOpen ? (
            <PanelLeftClose size="base" color="default" />
          ) : (
            <PanelLeftOpen size="base" color="default" />
          )}
        </IconButton>
      )}
    </Tooltip>
  );
  return (
    <div
      ref={workspaceRef}
      className="bg-background relative flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {!showSidebar && (
        <div className="flex shrink-0 items-center gap-1 border-b px-2 py-2.5">
          <DialogController
            renderDialog={({ closeDialog }) => (
              <Dialog title="Search session" closeOnInteractionOutside>
                <div className="min-h-0 flex-1 sm:h-[60dvh] sm:flex-none">
                  {renderSidebar(closeDialog)}
                </div>
              </Dialog>
            )}
          >
            {({ openDialog }) => (
              <div className="grid min-w-0 flex-1">
                <Button
                  disabled={isLoading}
                  onClick={() => openDialog()}
                  icon={Search}
                  text={search || "Search session"}
                  size="default"
                  variant="outline"
                />
              </div>
            )}
          </DialogController>
        </div>
      )}
      {/* Keep the timeline mounted across sidebar breakpoints for scrolling and highlights. */}
      {sidebarMode === "collapsible" ? (
        <div className="min-h-0 flex-1">
          <ResizableSplitLayout
            primaryContent={children}
            secondaryContent={
              <div className="bg-surface flex h-full flex-col overflow-hidden">
                {showSidebar && !isSidebarOpen && (
                  <div className="box-content flex h-7 shrink-0 items-center justify-center border-b py-4">
                    {sidebarToggle}
                  </div>
                )}
                <div
                  className={
                    showSidebar && isSidebarOpen ? "min-h-0 flex-1" : "hidden"
                  }
                >
                  {renderSidebar(
                    () => {},
                    isSidebarOpen ? sidebarToggle : undefined,
                  )}
                </div>
              </div>
            }
            open={showSidebar && isSidebarOpen}
            onOpenChange={showSidebar ? setIsSidebarOpen : undefined}
            showHandle={showSidebar}
            defaultPrimarySize={76}
            defaultSecondarySize={24}
            minPrimarySize={50}
            maxSecondarySize={50}
            collapsedSecondarySize={showSidebar ? "40px" : "0%"}
            minSecondarySize="200px"
            secondaryPosition="left"
            persistId="annotation-session-conversation-sidebar"
          />
        </div>
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 min-w-0 flex-1"
          defaultLayout={showSidebar ? defaultLayout : undefined}
          onLayoutChanged={showSidebar ? onLayoutChanged : undefined}
        >
          {showSidebar && (
            <ResizablePanel
              id="sidebar"
              defaultSize="24%"
              minSize="200px"
              maxSize="50%"
              className="h-full min-h-0"
            >
              {renderSidebar(() => {})}
            </ResizablePanel>
          )}
          {showSidebar && (
            <ResizableHandle withHandle aria-label="Resize session sidebar" />
          )}
          <ResizablePanel id="timeline" minSize={showSidebar ? "300px" : "0%"}>
            {children}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}
