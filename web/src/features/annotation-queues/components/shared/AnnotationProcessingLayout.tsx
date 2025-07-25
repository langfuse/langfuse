import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import useSessionStorage from "@/src/components/useSessionStorage";

interface AnnotationProcessingLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  projectId: string;
}

export const AnnotationProcessingLayout: React.FC<
  AnnotationProcessingLayoutProps
> = ({ leftPanel, rightPanel, projectId }) => {
  const [panelSize, setPanelSize] = useSessionStorage(
    `annotationQueuePanelSize-${projectId}`,
    65,
  );

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="h-full overflow-hidden"
      onLayout={(sizes) => {
        setPanelSize(sizes[0]);
      }}
    >
      <ResizablePanel
        className="col-span-1 h-full !overflow-y-auto rounded-md border"
        minSize={30}
        defaultSize={panelSize}
      >
        {leftPanel}
      </ResizablePanel>
      <ResizableHandle withHandle className="ml-4 bg-transparent" />
      <ResizablePanel
        className="col-span-1 h-full md:flex md:flex-col md:overflow-hidden"
        minSize={30}
      >
        {rightPanel}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};
