import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  classifyPanZoomWheel,
  panZoomAnchor,
  type PanZoomAnchor,
} from "@/src/utils/panZoomGestures";

type Point = { x: number; y: number };
type Options = {
  target: RefObject<HTMLElement | null>;
  onPan: (dxPx: number, dyPx: number) => void;
  /** One level doubles scale; anchor coordinates are fractions of the surface. */
  onZoom: (levels: number, anchor: PanZoomAnchor) => void;
  canPan?: (dxPx: number, dyPx: number) => boolean;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  enabled?: boolean;
  /** A surface with its own marquee gestures can reuse just the wheel adapter. */
  pointerPan?: boolean;
};

const DRAG_THRESHOLD_PX = 3;
const WHEEL_END_MS = 120;

/**
 * Device input only: callers own viewport math and rendering. Browser listeners,
 * pointer capture and animation-frame batching share one mount/cleanup lifecycle.
 */
export function usePanZoomGestures(options: Options) {
  const { target, enabled = true, pointerPan = true } = options;
  const live = useRef(options);
  live.current = options;
  const [isDragging, setIsDragging] = useState(false);
  const pending = useRef({
    levels: 0,
    dxPx: 0,
    dyPx: 0,
    anchor: { x: 0.5, y: 0.5 },
    frame: 0,
  });
  const wheelEnd = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contacts = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; midpoint: Point } | null>(null);
  const press = useRef<{
    pointerId: number;
    origin: Point;
    last: Point;
    dragged: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  const flush = () => {
    const queued = pending.current;
    queued.frame = 0;
    const { levels, dxPx, dyPx, anchor } = queued;
    queued.levels = 0;
    queued.dxPx = 0;
    queued.dyPx = 0;
    // Zoom about the previous midpoint, then translate to the new one. Both
    // callbacks read the caller's current camera, including the prior callback.
    if (levels !== 0) live.current.onZoom(levels, anchor);
    if (dxPx !== 0 || dyPx !== 0) live.current.onPan(dxPx, dyPx);
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const schedule = () => {
    live.current.onInteractionStart?.();
    if (!pending.current.frame) {
      pending.current.frame = requestAnimationFrame(() => flushRef.current());
    }
  };
  const finish = () => {
    if (pending.current.frame) {
      cancelAnimationFrame(pending.current.frame);
      flushRef.current();
    }
    live.current.onInteractionEnd?.();
  };

  useEffect(() => {
    const element = target.current;
    if (!element || !enabled) return;
    const activeContacts = contacts.current;
    const onWheel = (event: WheelEvent) => {
      const input = classifyPanZoomWheel(
        event,
        element.getBoundingClientRect(),
      );
      const queued = pending.current;
      if (input.kind === "zoom") {
        queued.levels += input.levels;
        queued.anchor = input.anchor;
      } else {
        if (live.current.canPan?.(input.dxPx, input.dyPx) === false) return;
        queued.dxPx += input.dxPx;
        queued.dyPx += input.dyPx;
      }
      event.preventDefault();
      live.current.onInteractionStart?.();
      if (!queued.frame) {
        queued.frame = requestAnimationFrame(() => flushRef.current());
      }
      if (wheelEnd.current) clearTimeout(wheelEnd.current);
      wheelEnd.current = setTimeout(() => {
        wheelEnd.current = null;
        if (pending.current.frame) {
          cancelAnimationFrame(pending.current.frame);
          flushRef.current();
        }
        live.current.onInteractionEnd?.();
      }, WHEEL_END_MS);
    };
    const onClick = (event: MouseEvent) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("click", onClick, { capture: true });
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("click", onClick, { capture: true });
      if (pending.current.frame) cancelAnimationFrame(pending.current.frame);
      if (wheelEnd.current) clearTimeout(wheelEnd.current);
      pending.current = {
        levels: 0,
        dxPx: 0,
        dyPx: 0,
        anchor: { x: 0.5, y: 0.5 },
        frame: 0,
      };
      activeContacts.clear();
      press.current = null;
      pinch.current = null;
    };
  }, [target, enabled]);

  const capture = (element: HTMLElement, pointerId: number) => {
    element.setPointerCapture?.(pointerId);
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || !pointerPan) return;
    if (event.pointerType !== "touch" && event.button !== 0) return;
    if (event.isPrimary) {
      contacts.current.clear();
      pinch.current = null;
      setIsDragging(false);
    }
    suppressClick.current = false;
    const point = { x: event.clientX, y: event.clientY };
    contacts.current.set(event.pointerId, point);
    if (contacts.current.size >= 2) {
      const [a, b] = [...contacts.current.values()];
      pinch.current = {
        distance: Math.hypot(b.x - a.x, b.y - a.y),
        midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      press.current = null;
      suppressClick.current = true;
      setIsDragging(true);
      for (const pointerId of contacts.current.keys()) {
        capture(event.currentTarget, pointerId);
      }
      live.current.onInteractionStart?.();
      return;
    }
    press.current = {
      pointerId: event.pointerId,
      origin: point,
      last: point,
      dragged: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || !pointerPan || !contacts.current.has(event.pointerId))
      return;
    // An uncaptured press can release outside the surface without a pointerup.
    if (event.pointerType === "mouse" && event.buttons === 0) {
      releasePointer(event);
      suppressClick.current = false;
      return;
    }
    const point = { x: event.clientX, y: event.clientY };
    contacts.current.set(event.pointerId, point);
    const previous = pinch.current;
    if (contacts.current.size >= 2 && previous) {
      const [a, b] = [...contacts.current.values()];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const queued = pending.current;
      if (previous.distance > 0 && distance > 0) {
        queued.levels += Math.log2(distance / previous.distance);
        if (!queued.frame) {
          queued.anchor = panZoomAnchor(
            previous.midpoint,
            event.currentTarget.getBoundingClientRect(),
          );
        }
      }
      queued.dxPx += midpoint.x - previous.midpoint.x;
      queued.dyPx += midpoint.y - previous.midpoint.y;
      pinch.current = { distance, midpoint };
      event.preventDefault();
      schedule();
      return;
    }
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.dragged) {
      const distance = Math.hypot(
        point.x - current.origin.x,
        point.y - current.origin.y,
      );
      if (distance < DRAG_THRESHOLD_PX) return;
      current.dragged = true;
      suppressClick.current = true;
      setIsDragging(true);
      capture(event.currentTarget, event.pointerId);
    }
    pending.current.dxPx += point.x - current.last.x;
    pending.current.dyPx += point.y - current.last.y;
    current.last = point;
    event.preventDefault();
    schedule();
  };

  const releasePointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || !pointerPan) return;
    if (!contacts.current.has(event.pointerId)) return;
    contacts.current.delete(event.pointerId);
    pinch.current = null;
    if (contacts.current.size >= 2) {
      const [a, b] = [...contacts.current.values()];
      pinch.current = {
        distance: Math.hypot(b.x - a.x, b.y - a.y),
        midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      press.current = null;
    } else if (contacts.current.size === 1) {
      const [pointerId, point] = [...contacts.current.entries()][0];
      press.current = {
        pointerId,
        origin: point,
        last: point,
        dragged: false,
      };
    } else if (contacts.current.size === 0) {
      press.current = null;
      setIsDragging(false);
      finish();
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return {
    isDragging: enabled && isDragging,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: releasePointer,
      onPointerCancel: releasePointer,
      onLostPointerCapture: releasePointer,
    },
  };
}
