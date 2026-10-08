import { useEffect, useEffectEvent, useRef } from "react";
import {
  displayedNodeWorldPoint,
  prepareMapNodes,
  readingLayoutBlend,
  zoneHalo,
  type Camera,
  type MapPosition,
  type Size,
  type TopicMapModel,
  type TopicMapNodeFrame,
  type TopicMapNodeLayout,
} from "./prepare-topic-map";
import {
  getTopicMapHover,
  publishTopicMapFrame,
  type TopicMapStore,
} from "./topic-map-store";

type Presentation = {
  frame: TopicMapNodeFrame | null;
  camera: Camera;
  pointer: MapPosition;
  layout: TopicMapNodeLayout;
  emphasis: Map<string, number>;
  offsets: Map<string, MapPosition>;
  transitionStarted: number;
  lastTime: number;
};

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
  const ink = `hsl(${theme.getPropertyValue("--foreground").trim()})`;
  const cloudVisibility = 1 - readingLayoutBlend(camera.zoom);
  context.globalAlpha = cloudVisibility;
  for (const zone of model.zones) {
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
    if (node.iconOpacity > 0) {
      const x =
        node.center.x + (rect.x + 18 - node.center.x) * node.textOpacity;
      const y =
        node.center.y + (rect.y + 18 - node.center.y) * node.textOpacity;
      context.globalAlpha = node.iconOpacity * opacity;
      context.strokeStyle = ink;
      context.lineWidth = 1.25;
      context.beginPath();
      context.moveTo(x - 5, y - 5);
      context.lineTo(x + 4, y - 5);
      context.lineTo(x + 4, y + 5);
      context.lineTo(x - 5, y + 5);
      context.closePath();
      context.moveTo(x - 2, y - 1);
      context.lineTo(x + 1, y - 1);
      context.moveTo(x - 2, y + 2);
      context.lineTo(x + 1, y + 2);
      context.stroke();
    }
  }
  context.globalAlpha = 1;
}

export function TopicMapCanvas({
  model,
  layout,
  size,
  camera,
  store,
  selectedTopic,
  selectedTraceId,
}: {
  model: TopicMapModel;
  layout: TopicMapNodeLayout;
  size: Size;
  camera: Camera;
  store: TopicMapStore;
  selectedTopic: string | null;
  selectedTraceId: string | null;
}) {
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
        pointer: targetPointer,
        layout,
        emphasis: new Map(),
        offsets: new Map(),
        transitionStarted: now,
        lastTime: now,
      };
      presentation.current = scene;
    }
    if (
      scene.layout !== layout ||
      scene.frame?.readingTopic !== selectedTopic
    ) {
      scene.offsets.clear();
      for (const [id, previous] of scene.frame?.nodeById ?? []) {
        const next = displayedNodeWorldPoint(
          previous.point,
          scene.camera.zoom,
          layout,
          selectedTopic,
        );
        scene.offsets.set(id, {
          x: previous.worldPosition.x - next.x,
          y: previous.worldPosition.y - next.y,
        });
      }
      scene.layout = layout;
      scene.transitionStarted = now;
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
    const cameraMoving = unsettled;
    scene.pointer = {
      x: approach(scene.pointer.x, targetPointer.x, 120, 0.001),
      y: approach(scene.pointer.y, targetPointer.y, 120, 0.001),
    };
    const transition = state.reducedMotion
      ? 1
      : Math.min(1, (now - scene.transitionStarted) / 260);
    const offsetWeight = (1 - transition) ** 3;
    const layoutMoving = offsetWeight > 0 && scene.offsets.size > 0;
    const positions = new Map<string, MapPosition>();
    if (layoutMoving) {
      unsettled = true;
      for (const point of model.points) {
        const next = displayedNodeWorldPoint(
          point,
          scene.camera.zoom,
          layout,
          selectedTopic,
        );
        const offset = scene.offsets.get(point.traceId);
        positions.set(point.traceId, {
          x: next.x + (offset?.x ?? 0) * offsetWeight,
          y: next.y + (offset?.y ?? 0) * offsetWeight,
        });
      }
    } else scene.offsets.clear();
    const frame = prepareMapNodes(
      model,
      layout,
      scene.camera,
      size,
      scene.pointer,
      selectedTopic,
      positions.size ? positions : undefined,
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
    publishTopicMapFrame(store, frame, cameraMoving || layoutMoving);
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
    layout,
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
