import type { RouterOutputs } from "@/src/utils/api";
import { topicColor } from "../topic-map-colors";

export type MapData = Pick<
  RouterOutputs["topics"]["map"],
  "points" | "missingSummaryCount" | "unpositionedCount"
>;
export type MapTopic = { id: string; name: string; description?: string };
export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
export type Camera = { x: number; y: number; zoom: number };
export type Size = { width: number; height: number };
export type MapPoint = MapData["points"][number] & {
  groupId: string;
  color: string;
  depth: number;
};
type MapZone = {
  id: string;
  name: string;
  description: string;
  color: string;
  points: MapPoint[];
  bounds: Bounds;
  x: number;
  y: number;
  countLabel: string;
  shareLabel: string;
};
export type TopicMapModel = {
  points: MapPoint[];
  zones: MapZone[];
  bounds: Bounds;
  pointById: Map<string, MapPoint>;
  populationLabel: string;
};

const emptyBounds = { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5 };
function pointBounds(points: { x: number; y: number }[]): Bounds {
  if (!points.length) return emptyBounds;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, maxX, minY, maxY };
}

function rotatePoints<T extends { x: number; y: number }>(
  points: T[],
  cohort: T[],
) {
  const count = Math.max(cohort.length, 1);
  const x = cohort.reduce((sum, p) => sum + p.x, 0) / count;
  const y = cohort.reduce((sum, p) => sum + p.y, 0) / count;
  let xx = 0,
    yy = 0,
    xy = 0;
  for (const p of cohort) {
    xx += (p.x - x) ** 2;
    yy += (p.y - y) ** 2;
    xy += (p.x - x) * (p.y - y);
  }
  // One rotation for the discovery cohort preserves distances and orientation.
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  return points.map((p) => ({
    ...p,
    x: (p.x - x) * Math.cos(angle) + (p.y - y) * Math.sin(angle),
    y: -(p.x - x) * Math.sin(angle) + (p.y - y) * Math.cos(angle),
  }));
}

export function baseScale(bounds: Bounds, size: Size) {
  return Math.min(
    Math.max(size.width - 100, 1) / Math.max(bounds.maxX - bounds.minX, 0.1),
    Math.max(size.height - 100, 1) / Math.max(bounds.maxY - bounds.minY, 0.1),
  );
}

export function fitCamera(bounds: Bounds, whole: Bounds, size: Size): Camera {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    zoom: Math.min(
      32,
      Math.max(0.4, baseScale(bounds, size) / baseScale(whole, size)),
    ),
  };
}

export function screenPoint(
  point: { x: number; y: number },
  camera: Camera,
  bounds: Bounds,
  size: Size,
) {
  const scale = baseScale(bounds, size) * camera.zoom;
  return {
    x: size.width / 2 + (point.x - camera.x) * scale,
    y: size.height / 2 - (point.y - camera.y) * scale,
  };
}

export function zoomCamera(
  camera: Camera,
  levels: number,
  anchor: { x: number; y: number },
  bounds: Bounds,
  size: Size,
): Camera {
  const zoom = Math.min(32, Math.max(0.4, camera.zoom * 2 ** levels));
  const before = baseScale(bounds, size) * camera.zoom;
  const after = baseScale(bounds, size) * zoom;
  const dx = (anchor.x - 0.5) * size.width;
  const dy = (anchor.y - 0.5) * size.height;
  return {
    x: camera.x + dx / before - dx / after,
    y: camera.y - dy / before + dy / after,
    zoom,
  };
}

export function panCamera(
  camera: Camera,
  dx: number,
  dy: number,
  bounds: Bounds,
  size: Size,
): Camera {
  const scale = baseScale(bounds, size) * camera.zoom;
  return { ...camera, x: camera.x - dx / scale, y: camera.y + dy / scale };
}

function visualDepth(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 31 + id.charCodeAt(i)) % 1000003;
  return (hash % 1000) / 1000;
}

export function prepareTopicMap(
  data: MapData,
  topics: MapTopic[],
): TopicMapModel {
  const known = new Map(
    topics.map((topic, i) => [topic.id, { ...topic, color: topicColor(i) }]),
  );
  const points: MapPoint[] = rotatePoints(data.points, data.points).map(
    (point) => ({
      ...point,
      groupId:
        point.outcome === "unassigned"
          ? "awaiting_map"
          : (point.topicId ?? "outliers"),
      color: topicColor(topics.findIndex((t) => t.id === point.topicId)),
      // This is decorative depth, independent of embedding distance or quality.
      depth: visualDepth(point.traceId),
    }),
  );
  const grouped = new Map<string, MapPoint[]>();
  for (const point of points) {
    const group = grouped.get(point.groupId) ?? [];
    group.push(point);
    grouped.set(point.groupId, group);
  }
  const zones = Array.from(grouped, ([id, members]): MapZone => {
    const topic = known.get(id);
    let description = topic?.description ?? members[0].summary;
    if (id === "outliers")
      description = "Summaries outside the discovered topics.";
    if (id === "awaiting_map")
      description = "These summaries have no current assignment.";
    return {
      id,
      name:
        topic?.name ??
        (id === "awaiting_map" ? "Assignment unavailable" : "Outliers"),
      description,
      color: topic?.color ?? topicColor(-1),
      points: members,
      bounds: pointBounds(members),
      x: members.reduce((sum, p) => sum + p.x, 0) / members.length,
      y: members.reduce((sum, p) => sum + p.y, 0) / members.length,
      countLabel: `${members.length.toLocaleString()} mapped traces`,
      shareLabel: `${Math.round((members.length / Math.max(points.length, 1)) * 100)}% of map`,
    };
  }).sort((a, b) => b.points.length - a.points.length);
  return {
    points,
    zones,
    bounds: pointBounds(points),
    pointById: new Map(points.map((p) => [p.traceId, p])),
    populationLabel: `${points.length.toLocaleString()} mapped traces`,
  };
}

export function displayedPoint(
  point: MapPoint,
  camera: Camera,
  bounds: Bounds,
  size: Size,
  pointer: { x: number; y: number },
) {
  const position = screenPoint(point, camera, bounds, size);
  return {
    x: position.x + pointer.x * point.depth * 6,
    y: position.y + pointer.y * point.depth * 6,
  };
}

export function hitPoint(
  model: TopicMapModel,
  camera: Camera,
  size: Size,
  pointer: { x: number; y: number },
  at: { x: number; y: number },
) {
  let nearest: MapPoint | null = null;
  let distance = 12;
  for (const point of model.points) {
    const p = displayedPoint(point, camera, model.bounds, size, pointer);
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d < distance) {
      nearest = point;
      distance = d;
    }
  }
  return nearest;
}

export function prepareMapLabels(
  model: TopicMapModel,
  camera: Camera,
  size: Size,
  pointer: { x: number; y: number },
  selectedId: string | null,
) {
  const zonesInView = model.zones
    .map((zone) => ({
      ...zone,
      position: screenPoint(zone, camera, model.bounds, size),
    }))
    .filter(
      ({ position: p }) =>
        p.x > 30 && p.x < size.width - 30 && p.y > 20 && p.y < size.height - 20,
    );
  const placed: { x: number; y: number; width: number; height: number }[] = [];
  const intersects = (a: (typeof placed)[number], b: (typeof placed)[number]) =>
    a.x < b.x + b.width + 8 &&
    a.x + a.width + 8 > b.x &&
    a.y < b.y + b.height + 8 &&
    a.y + a.height + 8 > b.y;
  const visibleZones = zonesInView.flatMap((zone) => {
    const detail = camera.zoom >= 1.8 ? zone.description : null;
    const width = Math.min(
      detail ? 264 : 220,
      Math.max(detail ? 248 : 192, zone.name.length * 6 + 24),
      size.width - 24,
    );
    let height = zone.name.length > 28 ? 64 : 52;
    if (detail) height += 44;
    const { x, y } = zone.position;
    const candidates = [
      [x - width / 2, y - height - 18],
      [x - width - 20, y - height - 18],
      [x + 20, y - height - 18],
      [x - width / 2, y + 20],
      [x - width - 20, y + 20],
      [x + 20, y + 20],
    ];
    for (const [left, top] of candidates) {
      const label = {
        x: Math.min(Math.max(12, left), size.width - width - 12),
        y: Math.min(Math.max(12, top), size.height - height - 32),
        width,
        height,
      };
      if (placed.some((other) => intersects(label, other))) continue;
      placed.push(label);
      return [{ ...zone, label, detail }];
    }
    return [];
  });
  const traces: {
    point: MapPoint;
    position: { x: number; y: number };
    card: { x: number; y: number; width: number; height: number };
    excerpt: string;
  }[] = [];
  if (camera.zoom >= 3) {
    const selected = selectedId ? model.pointById.get(selectedId) : undefined;
    const addLabel = (point: MapPoint) => {
      const position = displayedPoint(
        point,
        camera,
        model.bounds,
        size,
        pointer,
      );
      if (
        position.x < 20 ||
        position.x > size.width - 20 ||
        position.y < 30 ||
        position.y > size.height - 35
      )
        return;
      const card = {
        x: Math.min(Math.max(12, position.x + 10), size.width - 204),
        y: Math.min(position.y + 6, size.height - 100),
        width: 192,
        height: 76,
      };
      if (card.x < 0 || card.y < 0) return;
      if (
        traces.some(
          ({ card: placed }) =>
            card.x < placed.x + placed.width + 12 &&
            card.x + card.width + 12 > placed.x &&
            card.y < placed.y + placed.height + 12 &&
            card.y + card.height + 12 > placed.y,
        )
      )
        return;
      // Leave the topic's label readable above the cloud center.
      if (visibleZones.some(({ label }) => intersects(card, label))) return;
      traces.push({
        point,
        position,
        card,
        excerpt:
          point.summary.length > 135
            ? `${point.summary.slice(0, 132)}…`
            : point.summary,
      });
    };
    if (selected) addLabel(selected);
    for (const point of model.points) {
      if (point !== selected) addLabel(point);
      if (traces.length >= 24) break;
    }
  }
  return { zones: visibleZones, traces };
}

export function fitMapPoints(
  points: MapData["points"],
  cohort: MapData["points"],
  width: number,
  height: number,
) {
  const rotated = rotatePoints(points, cohort);
  const bounds = pointBounds(rotated);
  const size = { width, height };
  const camera = fitCamera(bounds, bounds, size);
  return rotated.map((point) => ({
    ...point,
    ...screenPoint(point, camera, bounds, size),
  }));
}
