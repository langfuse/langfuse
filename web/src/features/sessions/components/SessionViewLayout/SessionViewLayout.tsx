import { type ComponentProps, type ReactNode } from "react";
import { type SessionSidebar } from "@/src/features/sessions/components/SessionSidebar/SessionSidebar";
import { Filter, Search } from "@langfuse/icons";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
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
  customization,
  search,
  isLoading,
  children,
}: {
  renderSidebar: (onNavigate: () => void) => ReactNode;
  customization?: NonNullable<
    ComponentProps<typeof SessionSidebar>["search"]
  >["customization"];
  search: string;
  isLoading: boolean;
  children: ReactNode;
}) {
  const [workspaceRef, workspaceSize] = useElementSize<HTMLDivElement>();
  const showSidebar = (workspaceSize?.width ?? 0) >= 768;
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "session-conversation-sidebar",
    panelIds: ["sidebar", "timeline"],
    storage: "session",
  });
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
          {customization && (
            <Tooltip
              label={`Customize view${customization.activeFilterCount > 0 ? ` (${customization.activeFilterCount})` : ""}`}
            >
              {({ getTriggerProps }) => (
                <IconButton
                  {...getTriggerProps()}
                  icon={Filter}
                  size="md"
                  variant="outline"
                  label="Customize view"
                  onClick={customization.onCustomizeView}
                />
              )}
            </Tooltip>
          )}
        </div>
      )}
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
    </div>
  );
}
