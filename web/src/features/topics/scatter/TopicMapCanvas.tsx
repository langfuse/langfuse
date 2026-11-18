import { useEffect, useEffectEvent, useRef } from "react";
import {
  prepareMapNodes,
  stageScale,
  type Camera,
  type MapPosition,
  type Size,
  type TopicMapModel,
  type TopicMapNodeFrame,
} from "./prepare-topic-map";
import {
  getTopicMapHover,
  publishTopicMapFrame,
  type TopicMapStore,
} from "./topic-map-store";
import {
  drawLookDot,
  drawLookFields,
  lookBackground,
  lookDotColor,
  type Rgb,
  LOOK,
} from "./topic-map-looks";

export function TopicMapCanvas({
  model,
  size,
  camera,
  store,
  selectedTopic,
  selectedTraceId,
  matchingTraceIds,
}: TopicMapCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const presentation = useRef<Presentation | null>(null);
  const draw = useEffectEvent((now: number) => {
    if (!ref.current) return false;
    const state = store.getState();
    const target =
      state.scope === selectedTopic && state.camera ? state.camera : camera;
    const targetPointer = state.reducedMotion ? { x: 0, y: 0 } : state.pointer;
    let scene = presentation.current;
    if (!scene || scene.frame?.model !== model) {
      scene = {
        frame: null,
        camera: target,
        scope: selectedTopic,
        flight: null,
        pointer: targetPointer,
        emphasis: new Map(),
        lastTime: now,
      };
      presentation.current = scene;
    }
    const elapsed = Math.min(64, Math.max(1, now - scene.lastTime));
    scene.lastTime = now;
    let unsettled = false;
    const approach = (
      value: number,
      goal: number,
      duration: number,
      epsilon: number,
    ) => {
      if (state.reducedMotion || Math.abs(goal - value) <= epsilon) return goal;
      unsettled = true;
      return value + (goal - value) * (1 - Math.exp(-elapsed / duration));
    };
    if (scene.scope !== selectedTopic) {
      scene.scope = selectedTopic;
      scene.flight = state.reducedMotion
        ? null
        : { start: scene.camera, target, started: now };
    }
    if (
      scene.flight &&
      (scene.flight.target.x !== target.x ||
        scene.flight.target.y !== target.y ||
        scene.flight.target.zoom !== target.zoom)
    )
      scene.flight = null;
    if (scene.flight && !state.reducedMotion) {
      const { start, started } = scene.flight;
      const progress = Math.min(1, (now - started) / 1050);
      const t = progress ** 3 * (progress * (progress * 6 - 15) + 10);
      scene.camera = {
        x: start.x + (target.x - start.x) * t,
        y: start.y + (target.y - start.y) * t,
        zoom: Math.exp(
          Math.log(start.zoom) + Math.log(target.zoom / start.zoom) * t,
        ),
      };
      if (progress < 1) unsettled = true;
      else {
        scene.camera = target;
        scene.flight = null;
      }
    } else {
      const targetLogZoom = Math.log(target.zoom);
      const logZoom = approach(
        Math.log(scene.camera.zoom),
        targetLogZoom,
        65,
        0.0001,
      );
      scene.camera = {
        x: approach(scene.camera.x, target.x, 65, 0.00001),
        y: approach(scene.camera.y, target.y, 65, 0.00001),
        zoom: logZoom === targetLogZoom ? target.zoom : Math.exp(logZoom),
      };
    }
    const cameraMoving = unsettled;
    // Nothing drawn follows the pointer, so it needs no easing (and no extra frames).
    scene.pointer = targetPointer;
    const frame = prepareMapNodes(
      model,
      scene.camera,
      size,
      scene.pointer,
      selectedTopic,
      matchingTraceIds,
    );
    const hover = getTopicMapHover(state, frame);
    for (const point of model.points) {
      const goal =
        point.traceId === selectedTraceId || point.traceId === hover.hoveredId
          ? 1
          : 0;
      const strength = approach(
        scene.emphasis.get(point.traceId) ?? 0,
        goal,
        80,
        0.002,
      );
      if (strength) scene.emphasis.set(point.traceId, strength);
      else scene.emphasis.delete(point.traceId);
    }
    drawMap(ref.current, frame, scene.emphasis);
    scene.frame = frame;
    publishTopicMapFrame(store, frame, cameraMoving);
    return unsettled;
  });
  // Canvas owns presentation interpolation; DOM content and hit testing share its painted frame.
  useEffect(() => {
    let raf = 0;
    const step = (now: number) => {
      raf = 0;
      if (draw(now) && !raf) raf = requestAnimationFrame(step);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };
    schedule();
    const unsubscribe = store.subscribe((next, previous) => {
      if (
        next.camera !== previous.camera ||
        next.scope !== previous.scope ||
        next.hoveredId !== previous.hoveredId ||
        next.reducedMotion !== previous.reducedMotion
      )
        schedule();
    });
    const theme = new MutationObserver(schedule);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => {
      unsubscribe();
      theme.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [
    store,
    model,
    size.width,
    size.height,
    camera.x,
    camera.y,
    camera.zoom,
    selectedTopic,
    selectedTraceId,
    matchingTraceIds,
  ]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

/** Dots outside the highlight stay visible as context. */
const DIMMED = 0.25;
/** Unassigned dots recede so the topics read first; hover brings one back. */
const UNASSIGNED_OPACITY = 0.35;

const isUnassigned = (node: TopicMapNodeFrame["nodes"][number]) =>
  node.point.groupId === "outliers" || node.point.groupId === "awaiting_map";

/** Unassigned dots recede only on an unfiltered map; a highlighted one draws at full strength. */
function fadedOpacity(
  node: TopicMapNodeFrame["nodes"][number],
  frame: TopicMapNodeFrame,
) {
  if (!node.matchesFilters) return DIMMED;
  const highlighting =
    frame.readingTopic !== null || frame.matchingTraceIds !== undefined;
  return !highlighting && isUnassigned(node) ? UNASSIGNED_OPACITY : 1;
}

function drawMap(
  canvas: HTMLCanvasElement,
  frame: TopicMapNodeFrame,
  emphasis: ReadonlyMap<string, number>,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { camera, size } = frame;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (
    canvas.width !== Math.round(size.width * ratio) ||
    canvas.height !== Math.round(size.height * ratio)
  ) {
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, size.width, size.height);
  const { mark, rgbOf, ring } = canvasColors(canvas);
  // Blurred topic fields under ringed dots; an active dot gets an outline.
  drawLookFields(context, frame, LOOK, rgbOf, ratio);
  const stage = stageScale(size);
  // Unassigned dots go down first so topic colors sit on top.
  const unassigned = frame.nodes.filter((node) => isUnassigned(node));
  const assigned = frame.nodes.filter((node) => !isUnassigned(node));
  // One resolved color per topic, not per dot.
  const dotColors = new Map<string, Rgb>();
  for (const node of [...unassigned, ...assigned]) {
    const active = emphasis.get(node.point.traceId) ?? 0;
    let rgb = dotColors.get(node.point.color);
    if (!rgb) {
      rgb = rgbOf(lookDotColor(LOOK, node.point.color));
      dotColors.set(node.point.color, rgb);
    }
    drawLookDot(
      context,
      LOOK,
      node.center,
      rgb,
      ring,
      fadedOpacity(node, frame) + active * (1 - fadedOpacity(node, frame)),
      camera.zoom,
      stage,
    );
    if (active > 0.001) {
      context.globalAlpha = active * 0.7;
      context.lineWidth = 1.5;
      context.strokeStyle = mark(node.point.color);
      context.beginPath();
      context.arc(node.center.x, node.center.y, 7, 0, 2 * Math.PI);
      context.stroke();
    }
  }
  context.globalAlpha = 1;
}

/**
 * Resolves `var(--token)` colors, which canvas cannot read, to RGB so that
 * fading a color keeps its hue instead of passing through grey.
 */
function resolveCanvasColors(theme: CSSStyleDeclaration) {
  const resolved = new Map<string, [number, number, number]>();
  const probe = document.createElement("canvas").getContext("2d", {
    willReadFrequently: true,
  });
  const toRgb = (color: string): [number, number, number] => {
    const token = /^var\((--[\w-]+)\)$/.exec(color)?.[1];
    const value = token ? theme.getPropertyValue(token).trim() || color : color;
    if (!probe) return [148, 163, 184];
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = value;
    probe.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  };
  const rgbOf = (color: string) => {
    let rgb = resolved.get(color);
    if (!rgb) {
      rgb = toRgb(color);
      resolved.set(color, rgb);
    }
    return rgb;
  };
  const paint = (color: string, alpha = 1) => {
    const [r, g, b] = rgbOf(color);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  /** Small marks read lighter than bars, so they lean 30% towards the hue's foreground shade. */
  const mark = (color: string) => {
    const foreground = color.replace(/-highlight\)$/, "-foreground)");
    if (
      foreground === color ||
      !theme.getPropertyValue(foreground.slice(4, -1))
    )
      return paint(color);
    const base = rgbOf(color);
    const shade = rgbOf(foreground);
    const [r, g, b] = base.map((value, i) =>
      Math.round(value + (shade[i]! - value) * 0.3),
    );
    return `rgb(${r}, ${g}, ${b})`;
  };
  return { mark, rgbOf, ring: rgbOf(lookBackground(theme)) };
}

const colorCache = new WeakMap<
  HTMLCanvasElement,
  { key: string; colors: ReturnType<typeof resolveCanvasColors> }
>();

/** Colors resolve once per theme, not once per frame. */
function canvasColors(canvas: HTMLCanvasElement) {
  const root = document.documentElement;
  const key = `${root.className}|${root.style.cssText}`;
  let cached = colorCache.get(canvas);
  if (cached?.key !== key) {
    cached = { key, colors: resolveCanvasColors(getComputedStyle(canvas)) };
    colorCache.set(canvas, cached);
  }
  return cached.colors;
}

type TopicMapCanvasProps = {
  model: TopicMapModel;
  size: Size;
  camera: Camera;
  store: TopicMapStore;
  selectedTopic: string | null;
  selectedTraceId: string | null;
  matchingTraceIds?: ReadonlySet<string>;
};

type Presentation = {
  frame: TopicMapNodeFrame | null;
  camera: Camera;
  scope: string | null;
  flight: { start: Camera; target: Camera; started: number } | null;
  pointer: MapPosition;
  emphasis: Map<string, number>;
  lastTime: number;
};
