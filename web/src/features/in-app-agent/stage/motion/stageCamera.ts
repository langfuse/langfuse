export type StageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StageViewport = { width: number; height: number };

/**
 * The flight from the full page into the context slot, modelled as one camera
 * zooming out. Page and chat scale about the same fixed point: the page by
 * `zoom`, the chat by `zoom / slotScale`, so the slot inside the chat always
 * lands exactly where the page is drawn, on every frame.
 */
export type StageCamera = {
  slotScale: number;
  focus: { x: number; y: number };
  viewport: StageViewport;
};

export type StageFrame = {
  /** Where the page texture is drawn, in CSS px from the viewport origin. */
  rect: StageRect;
  /** Corner radius of the page texture, in CSS px. */
  radius: number;
  /** Rotation about the horizontal axis, in radians. */
  tilt: number;
  /** 0..1 depth blur. */
  blur: number;
  /** 0..1 darkening as the page recedes. */
  dim: number;
  /** 0..1 strength of the drop shadow under the page. */
  shadow: number;
  /** CSS transform of the chat layer, with a `0 0` transform origin. */
  chatTransform: string;
  chatOpacity: number;
};

/** Scale below which the slot is degenerate and the camera cannot fly into it. */
const MIN_SLOT_SCALE = 0.02;
/** Above this the slot is the viewport; there is nothing to zoom. */
const MAX_SLOT_SCALE = 0.98;
const MAX_TILT_RAD = (4 * Math.PI) / 180;

export function createStageCamera(
  viewport: StageViewport,
  slot: StageRect,
): StageCamera | null {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return null;
  }
  const slotScale = slot.width / viewport.width;
  if (
    !Number.isFinite(slotScale) ||
    slotScale < MIN_SLOT_SCALE ||
    slotScale > MAX_SLOT_SCALE
  ) {
    return null;
  }
  // The similarity mapping the viewport onto the slot fixes exactly one point.
  return {
    slotScale,
    viewport,
    focus: {
      x: slot.x / (1 - slotScale),
      y: slot.y / (1 - slotScale),
    },
  };
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * The frame at `progress` (0 = the page fills the screen, 1 = the page sits in
 * the slot). Zoom is interpolated geometrically so the camera moves at a
 * perceptually constant rate. Every effect is zero at both ends, so the first
 * frame matches the live page and the last matches the bubble.
 */
export function stageFrameAt(
  camera: StageCamera,
  progress: number,
  slotRadius: number,
): StageFrame {
  const p = Math.min(1, Math.max(0, progress));
  const { slotScale, focus, viewport } = camera;
  const zoom = Math.pow(slotScale, p);
  const chatZoom = zoom / slotScale;
  const arc = Math.sin(Math.PI * p);

  return {
    rect: {
      x: focus.x * (1 - zoom),
      y: focus.y * (1 - zoom),
      width: viewport.width * zoom,
      height: viewport.height * zoom,
    },
    radius: slotRadius * chatZoom * smoothstep(0, 0.3, p),
    tilt: MAX_TILT_RAD * arc,
    blur: arc * arc,
    dim: 0.06 * arc,
    shadow: arc,
    chatTransform: `translate(${focus.x * (1 - chatZoom)}px, ${focus.y * (1 - chatZoom)}px) scale(${chatZoom})`,
    chatOpacity: smoothstep(0.08, 0.6, p),
  };
}
