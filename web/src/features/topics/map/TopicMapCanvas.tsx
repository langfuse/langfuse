import { useEffect, useEffectEvent, useRef } from "react";
import {
  prepareMapNodes,
  nodeDetailBlend,
  zoneHalo,
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

export function TopicMapCanvas({
  model,
  size,
  camera,
  store,
  selectedTopic,
  selectedTraceId,
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
    scene.pointer = {
      x: approach(scene.pointer.x, targetPointer.x, 120, 0.001),
      y: approach(scene.pointer.y, targetPointer.y, 120, 0.001),
    };
    const frame = prepareMapNodes(
      model,
      scene.camera,
      size,
      scene.pointer,
      selectedTopic,
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
        next.pointer !== previous.pointer ||
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
  ]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

function drawMap(
  canvas: HTMLCanvasElement,
  frame: TopicMapNodeFrame,
  emphasis: ReadonlyMap<string, number>,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { model, camera, size, readingTopic } = frame;
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
  const theme = getComputedStyle(canvas);
  const surface = `hsl(${theme.getPropertyValue("--background").trim()})`;
  const cloudVisibility = 1 - nodeDetailBlend(camera.zoom);
  context.globalAlpha = cloudVisibility;
  for (const zone of frame.zones) {
    if (!cloudVisibility) break;
    if (zone.id === "outliers" || zone.id === "awaiting_map") continue;
    const { x, y, rx, ry } = zoneHalo(zone, camera, model.bounds, size);
    if (x + rx < 0 || x - rx > size.width || y + ry < 0 || y - ry > size.height)
      continue;
    context.save();
    context.translate(x, y);
    context.scale(rx, ry);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, `${zone.color}24`);
    gradient.addColorStop(0.7, `${zone.color}0c`);
    gradient.addColorStop(1, `${zone.color}00`);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, 1, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  for (const node of frame.nodes) {
    const { point, rect, cornerRadius } = node;
    const active = emphasis.get(point.traceId) ?? 0;
    const opacity =
      readingTopic && point.groupId !== readingTopic
        ? 0.22 + active * 0.78
        : 0.75 + point.depth * 0.2;
    context.beginPath();
    context.roundRect(rect.x, rect.y, rect.width, rect.height, cornerRadius);
    context.globalAlpha = opacity;
    context.fillStyle = point.color;
    context.fill();
    context.globalAlpha = node.backgroundOpacity * Math.min(1, opacity + 0.2);
    context.fillStyle = surface;
    context.fill();
    context.globalAlpha = (node.strokeOpacity * 0.4 + active * 0.6) * opacity;
    context.strokeStyle = point.color;
    context.lineWidth = 1 + active;
    context.stroke();
    if (active > 0.001) {
      context.globalAlpha = active * 0.7;
      context.lineWidth = 1.5;
      context.beginPath();
      context.roundRect(
        rect.x - 4,
        rect.y - 4,
        rect.width + 8,
        rect.height + 8,
        cornerRadius + 4,
      );
      context.stroke();
    }
  }
  context.globalAlpha = 1;
}

type TopicMapCanvasProps = {
  model: TopicMapModel;
  size: Size;
  camera: Camera;
  store: TopicMapStore;
  selectedTopic: string | null;
  selectedTraceId: string | null;
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
