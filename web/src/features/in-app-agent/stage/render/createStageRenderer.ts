import type { PageCapture } from "@/src/features/in-app-agent/stage/capture/capturePage";
import { createCssStageRenderer } from "@/src/features/in-app-agent/stage/render/cssStageRenderer";
import type { StageRenderer } from "@/src/features/in-app-agent/stage/render/stageRenderer";
import { createWebGlStageRenderer } from "@/src/features/in-app-agent/stage/render/webglStageRenderer";

export type StageRendererPreference = "webgl" | "css";

/** WebGL when it can hold the capture, otherwise a CSS transform of the image. */
export function createStageRenderer(params: {
  capture: PageCapture;
  preference: StageRendererPreference;
  onContextLost: () => void;
}): StageRenderer {
  if (params.preference === "webgl") {
    const renderer = createWebGlStageRenderer(params);
    if (renderer) {
      return renderer;
    }
  }
  return createCssStageRenderer(params);
}

let cachedMaxTextureSize: number | null | undefined;

/** The GPU's texture limit, probed once; null without WebGL 2. */
export function getMaxTextureSize(): number | null {
  if (cachedMaxTextureSize !== undefined) {
    return cachedMaxTextureSize;
  }
  const probe = document.createElement("canvas");
  const gl = probe.getContext("webgl2");
  cachedMaxTextureSize = gl
    ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number)
    : null;
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  return cachedMaxTextureSize;
}
