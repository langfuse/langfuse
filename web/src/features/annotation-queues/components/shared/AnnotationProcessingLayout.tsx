import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { useIsMobile } from "@/src/hooks/use-mobile";
import useSessionStorage from "@/src/components/useSessionStorage";

interface AnnotationProcessingLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  projectId: string;
}

export const AnnotationProcessingLayout: React.FC<
  AnnotationProcessingLayoutProps
> = ({ leftPanel, rightPanel, projectId }) => {
  const isMobile = useIsMobile();
  const [panelSize, setPanelSize] = useSessionStorage(
    `annotationQueuePanelSize-${projectId}`,
    65,
  );

  if (isMobile) {
    return (
      <div className="flex h-full flex-col gap-2 overflow-hidden md:hidden">
        <div className="h-1/2 overflow-y-auto">{leftPanel}</div>
        <div className="flex h-1/2 flex-col overflow-hidden">{rightPanel}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full border-b">
      <ResizablePanelGroup
        orientation="horizontal"
        className="h-full overflow-hidden"
        onLayoutChanged={(layout) => {
          const left = layout["annotation-left"];
          if (left != null) setPanelSize(left);
        }}
      >
        <ResizablePanel
          id="annotation-left"
          className="col-span-1 h-full overflow-y-auto!"
          minSize="25%"
          defaultSize={`${panelSize}%`}
        >
          {leftPanel}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel
          className="col-span-1 flex h-full flex-col overflow-hidden"
          minSize="30%"
        >
          {rightPanel}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
