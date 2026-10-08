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
  gridIndex: number;
  gridCount: number;
  gridCenter: { x: number; y: number };
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
      gridIndex: 0,
      gridCount: 0,
      gridCenter: { x: 0, y: 0 },
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
    const center = {
      x: members.reduce((sum, p) => sum + p.x, 0) / members.length,
      y: members.reduce((sum, p) => sum + p.y, 0) / members.length,
    };
    // Reading order belongs to trace identity, independently of selection or input order.
    [...members]
      .sort((a, b) => a.traceId.localeCompare(b.traceId))
      .forEach((point, gridIndex) => {
        point.gridIndex = gridIndex;
        point.gridCount = members.length;
        point.gridCenter = center;
      });
    let description =
      topic?.description?.trim() ||
      "No description is available for this topic.";
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
      ...center,
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

export function readingLayoutBlend(zoom: number) {
  const progress = Math.min(1, Math.max(0, (zoom - 3) / 7));
  return progress * progress * (3 - 2 * progress);
}

function traceCardSize(zoom: number, size: Size) {
  const blend = readingLayoutBlend(zoom);
  const readingWidth = Math.min(264, Math.max(1, size.width - 48));
  const cloudWidth = Math.min(192, Math.max(1, size.width - 24));
  return {
    width: cloudWidth + (readingWidth - cloudWidth) * blend,
    height: 76 + 68 * blend,
  };
}

export function displayedWorldPoint(
  point: MapPoint,
  zoom: number,
  bounds: Bounds,
  size: Size,
  readingTopic: string | null = null,
) {
  const blend = readingLayoutBlend(zoom);
  if (!blend || (readingTopic && point.groupId !== readingTopic))
    return { x: point.x, y: point.y };
  const card = traceCardSize(10, size);
  const pitchX = card.width + 24;
  const pitchY = card.height + 24;
  const columns = Math.min(
    point.gridCount,
    Math.max(1, Math.floor((size.width - 48) / pitchX)),
  );
  const rows = Math.ceil(point.gridCount / columns);
  const scale = baseScale(bounds, size) * 10;
  const dx =
    ((point.gridIndex % columns) - (columns - 1) / 2) * pitchX -
    (card.width + 12) / 2;
  const dy =
    (Math.floor(point.gridIndex / columns) - (rows - 1) / 2) * pitchY -
    card.height / 2;
  const grid = {
    x: point.gridCenter.x + dx / scale,
    y: point.gridCenter.y - dy / scale,
  };
  return {
    x: point.x + (grid.x - point.x) * blend,
    y: point.y + (grid.y - point.y) * blend,
  };
}

export function displayedPoint(
  point: MapPoint,
  camera: Camera,
  bounds: Bounds,
  size: Size,
  pointer: { x: number; y: number },
  readingTopic: string | null = null,
) {
  const position = screenPoint(
    displayedWorldPoint(point, camera.zoom, bounds, size, readingTopic),
    camera,
    bounds,
    size,
  );
  const parallax = point.depth * 6 * (1 - readingLayoutBlend(camera.zoom));
  return {
    x: position.x + pointer.x * parallax,
    y: position.y + pointer.y * parallax,
  };
}

export function hitPoint(
  model: TopicMapModel,
  camera: Camera,
  size: Size,
  pointer: { x: number; y: number },
  at: { x: number; y: number },
  readingTopic: string | null = null,
) {
  let nearest: MapPoint | null = null;
  let distance = 12;
  for (const point of model.points) {
    const p = displayedPoint(
      point,
      camera,
      model.bounds,
      size,
      pointer,
      readingTopic,
    );
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d < distance) {
      nearest = point;
      distance = d;
    }
  }
  return nearest;
}

export function zoneHalo(
  zone: TopicMapModel["zones"][number],
  camera: Camera,
  bounds: Bounds,
  size: Size,
) {
  const center = screenPoint(zone, camera, bounds, size);
  const scale = baseScale(bounds, size) * camera.zoom;
  return {
    ...center,
    rx: Math.max(28, (zone.bounds.maxX - zone.bounds.minX) * scale * 0.62),
    ry: Math.max(28, (zone.bounds.maxY - zone.bounds.minY) * scale * 0.62),
  };
}

export function hitZone(
  model: TopicMapModel,
  camera: Camera,
  size: Size,
  at: { x: number; y: number },
) {
  if (readingLayoutBlend(camera.zoom) >= 1) return null;
  let nearest: TopicMapModel["zones"][number] | null = null;
  let distance = 1;
  for (const zone of model.zones) {
    if (zone.id === "outliers" || zone.id === "awaiting_map") continue;
    const halo = zoneHalo(zone, camera, model.bounds, size);
    const d = Math.hypot((at.x - halo.x) / halo.rx, (at.y - halo.y) / halo.ry);
    if (d < distance) {
      nearest = zone;
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
  hoveredZoneId: string | null = null,
  hoveredId: string | null = null,
  readingTopic: string | null = null,
) {
  type Rectangle = { x: number; y: number; width: number; height: number };
  const blend = readingLayoutBlend(camera.zoom);
  const hoveredZone = hoveredId ? null : hoveredZoneId;
  const displayed = model.points
    .map((point) => ({
      point,
      position: displayedPoint(
        point,
        camera,
        model.bounds,
        size,
        pointer,
        readingTopic,
      ),
    }))
    .filter(
      ({ position: p }) =>
        p.x >= -12 &&
        p.x <= size.width + 12 &&
        p.y >= -12 &&
        p.y <= size.height + 12,
    );
  // A small screen-space index keeps collision work local even for dense cohorts.
  const cells = new Map<string, (typeof displayed)[number][]>();
  for (const dot of displayed) {
    const key = `${Math.floor(dot.position.x / 64)},${Math.floor(dot.position.y / 64)}`;
    const cell = cells.get(key) ?? [];
    cell.push(dot);
    cells.set(key, cell);
  }
  const overlapsDot = (card: Rectangle, dot: { x: number; y: number }) => {
    const dx = Math.max(card.x - dot.x, 0, dot.x - card.x - card.width);
    const dy = Math.max(card.y - dot.y, 0, dot.y - card.y - card.height);
    return Math.hypot(dx, dy) < 11.99;
  };
  const coveredDots = (card: Rectangle, firstOnly: boolean) => {
    let count = 0;
    for (
      let x = Math.floor((card.x - 12) / 64);
      x <= Math.floor((card.x + card.width + 12) / 64);
      x++
    ) {
      for (
        let y = Math.floor((card.y - 12) / 64);
        y <= Math.floor((card.y + card.height + 12) / 64);
        y++
      ) {
        for (const dot of cells.get(`${x},${y}`) ?? []) {
          if (overlapsDot(card, dot.position)) {
            count++;
            if (firstOnly) return count;
          }
        }
      }
    }
    return count;
  };
  const placed: Rectangle[] = [];
  const intersects = (a: Rectangle, b: Rectangle) =>
    a.x < b.x + b.width + 8 &&
    a.x + a.width + 8 > b.x &&
    a.y < b.y + b.height + 8 &&
    a.y + a.height + 8 > b.y;
  const placeCard = (
    position: { x: number; y: number },
    width: number,
    height: number,
    hovered: boolean,
    preserveDot: boolean,
  ): Rectangle | null => {
    if (size.width < width + 24 || size.height < height + 44) return null;
    const { x, y } = position;
    const candidates = [
      [x + 12, y - 7],
      [x - width - 12, y - 7],
      [x - width / 2, y - height - 12],
      [x - width / 2, y + 12],
      [x + 12, y - height - 12],
      [x - width - 12, y - height - 12],
      [x + 12, y + 12],
      [x - width - 12, y + 12],
    ];
    let fallback: { card: Rectangle; count: number } | null = null;
    for (const [left, top] of candidates) {
      const card = {
        x: Math.min(Math.max(12, left), size.width - width - 12),
        y: Math.min(Math.max(12, top), size.height - height - 32),
        width,
        height,
      };
      if (preserveDot && overlapsDot(card, position)) continue;
      if (placed.some((other) => intersects(card, other))) continue;
      const count = coveredDots(card, !hovered);
      if (!count) {
        placed.push(card);
        return card;
      }
      if (hovered && (!fallback || count < fallback.count))
        fallback = { card, count };
    }
    if (fallback) {
      placed.push(fallback.card);
      return fallback.card;
    }
    return null;
  };
  const traces: {
    point: MapPoint;
    position: { x: number; y: number };
    card: Rectangle;
    excerpt: string;
    reading: boolean;
  }[] = [];
  const added = new Set<string>();
  const addTrace = (point: MapPoint, hovered = false) => {
    if (added.has(point.traceId) || placed.length >= 64) return;
    const position = displayedPoint(
      point,
      camera,
      model.bounds,
      size,
      pointer,
      readingTopic,
    );
    // Hover follows the canvas's visible dot margin, including clipped edge dots.
    const margin = hovered ? -12 : 12;
    if (
      position.x < margin ||
      position.x > size.width - margin ||
      position.y < margin ||
      position.y > (hovered ? size.height + 12 : size.height - 32)
    )
      return;
    const { width, height } = traceCardSize(camera.zoom, size);
    const card = placeCard(position, width, height, hovered, true);
    if (!card) return;
    const reading = blend >= 0.5;
    const length = reading ? 320 : 135;
    traces.push({
      point,
      position,
      card,
      reading,
      excerpt:
        point.summary.length > length
          ? `${point.summary.slice(0, length - 3)}…`
          : point.summary,
    });
    added.add(point.traceId);
  };
  const hovered = hoveredId ? model.pointById.get(hoveredId) : undefined;
  if (hovered) addTrace(hovered, true);
  const selected = selectedId ? model.pointById.get(selectedId) : undefined;
  if (selected && camera.zoom >= 3) addTrace(selected);
  const zonesInView = model.zones
    .map((zone) => ({
      ...zone,
      position: screenPoint(zone, camera, model.bounds, size),
    }))
    .filter(
      ({ position: p }) =>
        p.x > 30 && p.x < size.width - 30 && p.y > 20 && p.y < size.height - 20,
    )
    .filter(
      (zone) => (camera.zoom >= 1.8 && blend < 0.65) || zone.id === hoveredZone,
    );
  const visibleZones = zonesInView.flatMap((zone) => {
    if (placed.length >= 64) return [];
    const detail = camera.zoom >= 1.8 ? zone.description : null;
    const width = Math.min(
      detail ? 264 : 220,
      Math.max(detail ? 248 : 192, zone.name.length * 6 + 24),
      size.width - 24,
    );
    let height = zone.name.length > 28 ? 64 : 52;
    if (detail) height += 44;
    const label = placeCard(
      zone.position,
      width,
      height,
      zone.id === hoveredZone,
      false,
    );
    return label ? [{ ...zone, label, detail }] : [];
  });
  if (camera.zoom >= 3) {
    for (const { point } of displayed) {
      if (readingTopic && point.groupId !== readingTopic) continue;
      addTrace(point);
      if (placed.length >= 64) break;
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
