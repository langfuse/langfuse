import type { ViewBox } from "../engine/projection";
import type { SceneVariant } from "./registry";

/**
 * Each scene's frame for its defaults, in viewBox units: the size its layout starts from, and the placeholder's size
 * while the scene loads. Content that needs more room grows the frame.
 */
export const SCENE_FRAMES: Record<SceneVariant, ViewBox> = {
  observability: { width: 576, height: 483 },
  evaluation: { width: 576, height: 436 },
  prompt: { width: 576, height: 466 },
  playground: { width: 428, height: 376 },
  experiments: { width: 428, height: 421 },
  annotation: { width: 428, height: 390 },
  metrics: { width: 428, height: 431 },
  agents: { width: 380, height: 310 },
  halo: { width: 455, height: 421 },
};
