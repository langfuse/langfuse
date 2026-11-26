const PINCH_ZOOM_RATE = 1 / 40;
const WHEEL_LINE_PX = 16;

/** Scroll pans; only pinch or an explicit modifier asks for zoom. */
export function classifyPanZoomWheel(
  event: WheelInput,
  bounds: SurfaceBounds,
):
  | { kind: "pan"; dxPx: number; dyPx: number }
  | { kind: "zoom"; levels: number; anchor: PanZoomAnchor } {
  const unit = wheelUnit(event.deltaMode, bounds.height);
  const deltaX = finite(event.deltaX) * unit;
  const deltaY = finite(event.deltaY) * unit;
  if (event.ctrlKey || event.metaKey) {
    return {
      kind: "zoom",
      levels: -deltaY * PINCH_ZOOM_RATE,
      anchor: panZoomAnchor({ x: event.clientX, y: event.clientY }, bounds),
    };
  }
  return {
    kind: "pan",
    dxPx: event.shiftKey ? -deltaY : -deltaX,
    dyPx: event.shiftKey ? 0 : -deltaY,
  };
}

/** Fractions of the measured surface; off-surface contacts stay at its edge. */
export function panZoomAnchor(
  point: { x: number; y: number },
  bounds: SurfaceBounds,
): PanZoomAnchor {
  return {
    x: ratio(point.x - bounds.left, bounds.width),
    y: ratio(point.y - bounds.top, bounds.height),
  };
}

function wheelUnit(deltaMode: number, height: number) {
  if (deltaMode === 1) return WHEEL_LINE_PX;
  if (deltaMode === 2) return Math.max(height, 1);
  return 1;
}

function ratio(value: number, extent: number) {
  return extent > 0 ? Math.min(Math.max(finite(value) / extent, 0), 1) : 0.5;
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export type PanZoomAnchor = { x: number; y: number };

type SurfaceBounds = Pick<DOMRect, "left" | "top" | "width" | "height">;
type WheelInput = Pick<
  WheelEvent,
  | "deltaX"
  | "deltaY"
  | "deltaMode"
  | "ctrlKey"
  | "metaKey"
  | "shiftKey"
  | "clientX"
  | "clientY"
>;
