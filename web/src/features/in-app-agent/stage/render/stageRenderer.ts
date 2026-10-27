import type { PageCapture } from "@/src/features/in-app-agent/stage/capture/capturePage";
import type { StageFrame } from "@/src/features/in-app-agent/stage/motion/stageCamera";

/** Draws the captured page at a frame of the stage flight. */
export type StageRenderer = {
  kind: "webgl" | "css";
  /** Full-viewport element to mount above the chat layer. */
  element: HTMLElement;
  render: (frame: StageFrame) => void;
  /** Releases GPU memory and detaches the element. */
  dispose: () => void;
};

export type StageRendererFactory = (params: {
  capture: PageCapture;
  onContextLost: () => void;
}) => StageRenderer | null;

export function pinFullViewport(element: HTMLElement) {
  element.style.position = "fixed";
  element.style.inset = "0";
  element.style.width = "100%";
  element.style.height = "100%";
  element.style.pointerEvents = "none";
  element.setAttribute("aria-hidden", "true");
}
