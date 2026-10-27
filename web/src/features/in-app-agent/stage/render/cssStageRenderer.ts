import {
  pinFullViewport,
  type StageRenderer,
  type StageRendererFactory,
} from "@/src/features/in-app-agent/stage/render/stageRenderer";

/**
 * Fallback without WebGL: the capture canvas itself, moved with a
 * compositor-only transform. Rounded corners come from `border-radius` in the
 * element's unscaled coordinates; blur, dim and shadow are left out because
 * animating them repaints a full-viewport layer every frame.
 */
export function createCssStageRenderer({
  capture,
}: Parameters<StageRendererFactory>[0]): StageRenderer {
  const host = document.createElement("div");
  pinFullViewport(host);
  host.style.overflow = "hidden";

  const surface = document.createElement("div");
  surface.style.position = "absolute";
  surface.style.left = "0";
  surface.style.top = "0";
  surface.style.width = `${capture.cssWidth}px`;
  surface.style.height = `${capture.cssHeight}px`;
  surface.style.transformOrigin = "0 0";
  surface.style.overflow = "hidden";
  surface.style.willChange = "transform";

  const image = capture.canvas;
  image.style.display = "block";
  image.style.width = "100%";
  image.style.height = "100%";
  surface.appendChild(image);
  host.appendChild(surface);

  return {
    kind: "css",
    element: host,
    render(frame) {
      const scale = frame.rect.width / capture.cssWidth;
      surface.style.transform = `translate(${frame.rect.x}px, ${frame.rect.y}px) scale(${scale})`;
      surface.style.borderRadius = `${scale > 0 ? frame.radius / scale : 0}px`;
    },
    dispose() {
      image.remove();
      host.remove();
    },
  };
}
