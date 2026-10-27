import type { PageCapture } from "@/src/features/in-app-agent/stage/capture/capturePage";

/** Enough for the largest bubble thumbnail at 2x. */
const THUMBNAIL_SOURCE_MAX_WIDTH = 720;

function drawStepped(
  source: HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  let current = source;
  // Halving steps keep small text legible instead of aliasing.
  while (current.width / 2 > width) {
    const step = document.createElement("canvas");
    step.width = Math.round(current.width / 2);
    step.height = Math.round(current.height / 2);
    const context = step.getContext("2d");
    if (!context) {
      break;
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(current, 0, 0, step.width, step.height);
    current = step;
  }
  const target = document.createElement("canvas");
  target.width = Math.max(1, Math.round(width));
  target.height = Math.max(1, Math.round(height));
  const context = target.getContext("2d");
  if (context) {
    context.imageSmoothingQuality = "high";
    context.drawImage(current, 0, 0, target.width, target.height);
  }
  return target;
}

/**
 * A small copy of the capture for message bubbles, so a conversation keeps a
 * picture of each attached page without holding full-resolution pixels.
 */
export function createThumbnailSource(capture: PageCapture) {
  const width = Math.min(THUMBNAIL_SOURCE_MAX_WIDTH, capture.canvas.width);
  const height = (width / capture.canvas.width) * capture.canvas.height;
  return drawStepped(capture.canvas, width, height);
}

/** Paints a thumbnail source into a canvas at that canvas's laid-out size. */
export function drawThumbnail(
  target: HTMLCanvasElement,
  source: HTMLCanvasElement,
) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(target.clientWidth * pixelRatio));
  const height = Math.max(1, Math.round(target.clientHeight * pixelRatio));
  const scaled = drawStepped(source, width, height);
  target.width = width;
  target.height = height;
  target.getContext("2d")?.drawImage(scaled, 0, 0);
}
