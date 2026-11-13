import { type ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
} from "@/src/components/ui/resizable";

const PANEL_IDS = ["topics", "traces"];
/** Stacked, the trace list's header and a few rows stay visible however short the page. */
const TRACES_MIN_HEIGHT = "15rem";

/**
 * Topics beside or above the selected topic's traces. The handle is the only
 * divider, so neither side should draw a border towards the other.
 */
export function TopicsSplit({
  id,
  orientation,
  defaultTopicsSize,
  topics,
  traces,
}: TopicsSplitProps) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `${id}-${orientation}`,
    panelIds: PANEL_IDS,
    storage: "local",
  });
  return (
    <ResizablePanelGroup
      key={orientation}
      orientation={orientation}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="min-h-0 min-w-0 flex-1"
    >
      <ResizablePanel
        id="topics"
        defaultSize={defaultTopicsSize}
        minSize="20%"
        className="flex flex-col"
      >
        {topics}
      </ResizablePanel>
      <ResizableHandle
        withHandle="hover"
        aria-label="Resize topics and traces"
      />
      <ResizablePanel
        id="traces"
        minSize={orientation === "vertical" ? TRACES_MIN_HEIGHT : "25%"}
        className="flex flex-col"
      >
        {traces}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

type TopicsSplitProps = {
  /** Persists the layout per view; each orientation keeps its own sizes. */
  id: string;
  orientation: "horizontal" | "vertical";
  defaultTopicsSize: `${number}%`;
  topics: ReactNode;
  traces: ReactNode;
};
