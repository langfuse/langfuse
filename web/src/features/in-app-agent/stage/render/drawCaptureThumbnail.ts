import type { PageCapture } from "@/src/features/in-app-agent/stage/capture/capturePage";

/**
 * Paints the capture into a thumbnail canvas at the canvas's laid-out size,
 * stepping down by halves so small text stays legible instead of aliasing.
 */
export function drawCaptureThumbnail(
  target: HTMLCanvasElement,
  capture: PageCapture,
) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(target.clientWidth * pixelRatio));
  const height = Math.max(1, Math.round(target.clientHeight * pixelRatio));
  target.width = width;
  target.height = height;

  let source: CanvasImageSource = capture.canvas;
  let sourceWidth = capture.canvas.width;
  let sourceHeight = capture.canvas.height;
  while (sourceWidth / 2 > width) {
    const step = document.createElement("canvas");
    step.width = Math.round(sourceWidth / 2);
    step.height = Math.round(sourceHeight / 2);
    const stepContext = step.getContext("2d");
    if (!stepContext) {
      break;
    }
    stepContext.imageSmoothingQuality = "high";
    stepContext.drawImage(source, 0, 0, step.width, step.height);
    source = step;
    sourceWidth = step.width;
    sourceHeight = step.height;
  }

  const context = target.getContext("2d");
  if (!context) {
    return;
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
}
