import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  usePersistentPanelSize,
} from "@/src/components/ui/resizable";

const ANNOTATION_LEFT_PANEL_ID = "annotation-left";

interface AnnotationProcessingLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  projectId: string;
}

export const AnnotationProcessingLayout: React.FC<
  AnnotationProcessingLayoutProps
> = ({ leftPanel, rightPanel, projectId }) => {
  const { panelSize, onLayoutChanged } = usePersistentPanelSize({
    storageKey: `annotationQueuePanelSize-${projectId}`,
    panelId: ANNOTATION_LEFT_PANEL_ID,
    defaultSize: 65,
  });

  return (
    <>
      {/* Mobile: Vertical stack without resizing */}
      <div className="flex h-full flex-col gap-2 overflow-hidden md:hidden">
        <div className="h-1/2 overflow-y-auto rounded-md border">
          {leftPanel}
        </div>
        <div className="flex h-1/2 flex-col overflow-hidden">{rightPanel}</div>
      </div>

      {/* Desktop: Horizontal resizable panels */}
      <div className="hidden max-h-full min-h-0 overflow-hidden md:block">
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full overflow-hidden"
          onLayoutChanged={onLayoutChanged}
        >
          <ResizablePanel
            id={ANNOTATION_LEFT_PANEL_ID}
            className="col-span-1 h-full !overflow-y-auto rounded-md border"
            minSize="30%"
            defaultSize={`${panelSize}%`}
          >
            {leftPanel}
          </ResizablePanel>
          <ResizableHandle withHandle className="ml-4 bg-transparent" />
          <ResizablePanel
            className="col-span-1 flex h-full flex-col overflow-hidden"
            minSize="30%"
          >
            {rightPanel}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  );
};
