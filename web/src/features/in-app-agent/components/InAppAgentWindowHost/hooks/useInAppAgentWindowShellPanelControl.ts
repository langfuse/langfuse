import {
  type MovableResizablePanelSize,
  useMovableResizablePanelControl,
} from "@/src/components/movable-resizable-panel";
import { type RefObject, useCallback } from "react";

const IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX = 8;
const IN_APP_AGENT_WINDOW_SHELL_DEFAULT_WIDTH_PX = 448;
const IN_APP_AGENT_WINDOW_SHELL_DEFAULT_MAX_HEIGHT_PX = 672;
const IN_APP_AGENT_WINDOW_SHELL_MIN_SIZE = {
  width: 360,
  height: 420,
} satisfies MovableResizablePanelSize;

export function useInAppAgentWindowShellPanelControl({
  anchorRef,
}: {
  anchorRef?: RefObject<HTMLElement | null>;
} = {}) {
  const getInitialGeometry = useCallback(() => {
    const anchorRect = anchorRef?.current?.getBoundingClientRect();
    const viewportHeight =
      typeof window === "undefined" ? 768 : window.innerHeight;
    const viewportWidth =
      typeof window === "undefined" ? 1024 : window.innerWidth;
    const width = Math.min(
      IN_APP_AGENT_WINDOW_SHELL_DEFAULT_WIDTH_PX,
      viewportWidth - IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX * 2,
    );
    const height = Math.min(
      IN_APP_AGENT_WINDOW_SHELL_DEFAULT_MAX_HEIGHT_PX,
      viewportHeight - 32,
    );

    return {
      position: {
        left: anchorRect
          ? anchorRect.right - 6
          : viewportWidth - width - IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX,
        top:
          viewportHeight - height - IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX,
      },
      size: { width, height },
    };
  }, [anchorRef]);

  return useMovableResizablePanelControl({
    boundsPadding: IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX,
    getInitialGeometry,
    minSize: IN_APP_AGENT_WINDOW_SHELL_MIN_SIZE,
  });
}
