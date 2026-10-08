import { useEffect, useEffectEvent, useRef } from "react";
import {
  baseScale,
  displayedPoint,
  screenPoint,
  type Camera,
  type MapPoint,
  type Size,
  type TopicMapModel,
} from "./prepare-topic-map";
import type { TopicMapStore } from "./topic-map-store";

function drawMap(
  canvas: HTMLCanvasElement,
  model: TopicMapModel,
  size: Size,
  camera: Camera,
  pointer: { x: number; y: number },
  selectedTopic: string | null,
  activeId: string | null,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
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
  const scale = baseScale(model.bounds, size) * camera.zoom;
  for (const zone of model.zones) {
    if (zone.id === "outliers" || zone.id === "awaiting_map") continue;
    const center = screenPoint(zone, camera, model.bounds, size);
    const rx = Math.max(
      28,
      (zone.bounds.maxX - zone.bounds.minX) * scale * 0.62,
    );
    const ry = Math.max(
      28,
      (zone.bounds.maxY - zone.bounds.minY) * scale * 0.62,
    );
    if (
      center.x + rx < 0 ||
      center.x - rx > size.width ||
      center.y + ry < 0 ||
      center.y - ry > size.height
    )
      continue;
    context.save();
    context.translate(center.x, center.y);
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
    if (zone.id === selectedTopic) {
      context.strokeStyle = `${zone.color}55`;
      context.lineWidth = 1;
      context.setLineDash([3, 6]);
      context.beginPath();
      context.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
    }
  }
  const drawPoint = (point: MapPoint, active: boolean) => {
    const p = displayedPoint(point, camera, model.bounds, size, pointer);
    if (
      p.x < -12 ||
      p.x > size.width + 12 ||
      p.y < -12 ||
      p.y > size.height + 12
    )
      return;
    const radius = active
      ? 7
      : Math.min(4.5, 2.2 + camera.zoom * 0.3) + point.depth * 0.7;
    context.globalAlpha =
      selectedTopic && point.groupId !== selectedTopic && !active
        ? 0.22
        : 0.65 + point.depth * 0.3;
    context.fillStyle = point.color;
    context.beginPath();
    context.arc(p.x, p.y, radius, 0, Math.PI * 2);
    context.fill();
    if (active) {
      context.globalAlpha = 1;
      context.strokeStyle = point.color;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(p.x, p.y, radius + 4, 0, Math.PI * 2);
      context.stroke();
    }
  };
  for (const point of model.points)
    if (point.traceId !== activeId) drawPoint(point, false);
  const active = activeId ? model.pointById.get(activeId) : undefined;
  if (active) drawPoint(active, true);
  context.globalAlpha = 1;
}

export function TopicMapCanvas({
  model,
  size,
  camera,
  store,
  selectedTopic,
  selectedTraceId,
}: {
  model: TopicMapModel;
  size: Size;
  camera: Camera;
  store: TopicMapStore;
  selectedTopic: string | null;
  selectedTraceId: string | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const draw = useEffectEvent(() => {
    if (!ref.current) return;
    const state = store.getState();
    drawMap(
      ref.current,
      model,
      size,
      state.scope === selectedTopic && state.camera ? state.camera : camera,
      state.reducedMotion ? { x: 0, y: 0 } : state.pointer,
      selectedTopic,
      selectedTraceId ?? state.hoveredId,
    );
  });
  // Canvas and the animation frame scheduler are the external render system.
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => draw());
    };
    schedule();
    const unsubscribe = store.subscribe(schedule);
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [
    store,
    model,
    size.width,
    size.height,
    camera,
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
