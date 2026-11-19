import { useEffect, useEffectEvent, useRef } from "react";
import {
  prepareMapNodes,
  haloVisibility,
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
import { mapColors } from "./map-colors";

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

const isUnassigned = (node: TopicMapNodeFrame["nodes"][number]) =>
  node.point.groupId === "outliers" || node.point.groupId === "awaiting_map";

function drawMap(
  canvas: HTMLCanvasElement,
  frame: TopicMapNodeFrame,
  emphasis: ReadonlyMap<string, number>,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { model, camera, size, matchingTraceIds } = frame;
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
  const colors = mapColors(canvas);
  // One soft halo per topic, fading out when zoomed in.
  const halos = haloVisibility(camera.zoom);
  for (const zone of halos > 0 ? frame.zones : []) {
    if (zone.id === "outliers" || zone.id === "awaiting_map") continue;
    const { x, y, rx, ry } = zoneHalo(zone, camera, model.bounds, size);
    if (x + rx < 0 || x - rx > size.width || y + ry < 0 || y - ry > size.height)
      continue;
    // The fade goes through globalAlpha, so the gradient colors stay cached.
    context.globalAlpha =
      halos *
      (!matchingTraceIds ||
      zone.points.some((point) => matchingTraceIds.has(point.traceId))
        ? 1
        : 0.15);
    context.save();
    context.translate(x, y);
    context.scale(rx, ry);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, colors.paint(zone.color, 0.3));
    gradient.addColorStop(0.7, colors.paint(zone.color, 0.1));
    gradient.addColorStop(1, colors.paint(zone.color, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, 1, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  // Ringed dots in lighter topic tones; unassigned dots go down first.
  const ordered = [
    ...frame.nodes.filter(isUnassigned),
    ...frame.nodes.filter((node) => !isUnassigned(node)),
  ];
  for (const node of ordered) {
    const { point, rect } = node;
    const active = emphasis.get(point.traceId) ?? 0;
    const opacity = node.matchesFilters ? 1 : DIMMED + active * (1 - DIMMED);
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    const radius = Math.min(rect.width, rect.height) / 2;
    context.globalAlpha = opacity * 0.9;
    context.beginPath();
    context.arc(x, y, radius + 1, 0, 2 * Math.PI);
    context.fillStyle = colors.ring;
    context.fill();
    context.globalAlpha = opacity;
    context.beginPath();
    context.arc(x, y, radius, 0, 2 * Math.PI);
    context.fillStyle = colors.dot(point.color);
    context.fill();
    if (active > 0.001) {
      context.globalAlpha = active * 0.7;
      context.lineWidth = 1.5;
      context.strokeStyle = colors.dot(point.color);
      context.beginPath();
      context.arc(x, y, radius + 4, 0, 2 * Math.PI);
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
