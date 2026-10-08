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

export type MapPosition = { x: number; y: number };
type MapRectangle = MapPosition & { width: number; height: number };
export type TopicMapNodeLayout = {
  bounds: Bounds;
  size: Size;
  worldTargets: ReadonlyMap<string, MapPosition>;
};
type TopicMapNode = {
  point: MapPoint;
  center: MapPosition;
  worldPosition: MapPosition;
  rect: MapRectangle;
  cornerRadius: number;
  expansion: number;
  backgroundOpacity: number;
  strokeOpacity: number;
  iconOpacity: number;
  textOpacity: number;
  excerpt: string;
};
export type TopicMapNodeFrame = {
  model: TopicMapModel;
  camera: Camera;
  size: Size;
  pointer: MapPosition;
  readingTopic: string | null;
  zones: TopicMapModel["zones"];
  nodes: TopicMapNode[];
  nodeById: ReadonlyMap<string, TopicMapNode>;
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
    const center = {
      x: members.reduce((sum, p) => sum + p.x, 0) / members.length,
      y: members.reduce((sum, p) => sum + p.y, 0) / members.length,
    };
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

function smoothStep(from: number, to: number, value: number) {
  const progress = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return progress * progress * (3 - 2 * progress);
}

export function readingLayoutBlend(zoom: number) {
  return smoothStep(3, 10, zoom);
}

function readingNodeSize(size: Size) {
  return { width: Math.max(6, Math.min(264, size.width - 48)), height: 144 };
}

type ReadingZone = {
  zone: TopicMapModel["zones"][number];
  bounds: Bounds;
};

function separationAxis(a: ReadingZone, b: ReadingZone): "x" | "y" {
  const first = a.zone.bounds;
  const second = b.zone.bounds;
  const gapX = Math.max(first.minX - second.maxX, second.minX - first.maxX);
  const gapY = Math.max(first.minY - second.maxY, second.minY - first.maxY);
  if (gapX >= 0 && gapY < 0) return "x";
  if (gapY >= 0 && gapX < 0) return "y";
  const spanX = Math.max(
    first.maxX - first.minX,
    second.maxX - second.minX,
    0.1,
  );
  const spanY = Math.max(
    first.maxY - first.minY,
    second.maxY - second.minY,
    0.1,
  );
  const x = gapX >= 0 ? gapX : Math.abs(a.zone.x - b.zone.x);
  const y = gapY >= 0 ? gapY : Math.abs(a.zone.y - b.zone.y);
  return x / spanX >= y / spanY ? "x" : "y";
}

function separateReadingZones(
  zones: ReadingZone[],
  gap: number,
  anchorZoneId: string | null,
) {
  const constraints = {
    x: new Map<string, { before: string; distance: number }[]>(),
    y: new Map<string, { before: string; distance: number }[]>(),
  };
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const axis = separationAxis(zones[i], zones[j]);
      const [a, b] = [zones[i], zones[j]].sort(
        (a, b) =>
          a.zone[axis] - b.zone[axis] || a.zone.id.localeCompare(b.zone.id),
      );
      const distance =
        axis === "x"
          ? a.bounds.maxX - a.zone.x - (b.bounds.minX - b.zone.x) + gap
          : a.bounds.maxY - a.zone.y - (b.bounds.minY - b.zone.y) + gap;
      const predecessors = constraints[axis].get(b.zone.id) ?? [];
      predecessors.push({ before: a.zone.id, distance });
      constraints[axis].set(b.zone.id, predecessors);
    }
  }
  const offsets = new Map(zones.map(({ zone }) => [zone.id, { x: 0, y: 0 }]));
  for (const axis of ["x", "y"] as const) {
    const centers = new Map<string, number>();
    // Canonical ordering makes each axis a DAG; spacing propagates without iterative repulsion.
    for (const { zone } of [...zones].sort(
      (a, b) =>
        a.zone[axis] - b.zone[axis] || a.zone.id.localeCompare(b.zone.id),
    )) {
      let center = zone[axis];
      for (const constraint of constraints[axis].get(zone.id) ?? [])
        center = Math.max(
          center,
          centers.get(constraint.before)! + constraint.distance,
        );
      centers.set(zone.id, center);
      offsets.get(zone.id)![axis] = center - zone[axis];
    }
    const anchor = offsets.get(anchorZoneId ?? "");
    const drift =
      anchor?.[axis] ??
      zones.reduce(
        (sum, { zone }) =>
          sum + offsets.get(zone.id)![axis] * zone.points.length,
        0,
      ) /
        Math.max(
          1,
          zones.reduce((sum, { zone }) => sum + zone.points.length, 0),
        );
    for (const offset of offsets.values()) offset[axis] -= drift;
  }
  return offsets;
}

export function prepareNodeLayout(
  model: TopicMapModel,
  size: Size,
  readingTopic: string | null = null,
  anchorZoneId: string | null = readingTopic,
): TopicMapNodeLayout {
  const full = readingNodeSize(size);
  const pitchX = full.width + 24;
  const pitchY = full.height + 24;
  const scale = baseScale(model.bounds, size) * 10;
  const worldTargets = new Map<string, MapPosition>();
  const zones: ReadingZone[] = [];
  for (const zone of model.zones) {
    const reading = !readingTopic || readingTopic === zone.id;
    if (!reading) {
      for (const point of zone.points)
        worldTargets.set(point.traceId, { x: point.x, y: point.y });
    } else {
      const columns = Math.min(
        zone.points.length,
        Math.max(1, Math.floor((size.width - 48) / pitchX)),
      );
      const rows = Math.ceil(zone.points.length / columns);
      // Spatial rows preserve the cloud's vertical order; horizontal ranks are local to each row.
      const vertical = [...zone.points].sort(
        (a, b) => b.y - a.y || a.x - b.x || a.traceId.localeCompare(b.traceId),
      );
      for (let row = 0; row < rows; row++) {
        const members = vertical
          .slice(row * columns, (row + 1) * columns)
          .sort(
            (a, b) =>
              a.x - b.x || b.y - a.y || a.traceId.localeCompare(b.traceId),
          );
        members.forEach((point, column) =>
          worldTargets.set(point.traceId, {
            x: zone.x + ((column - (members.length - 1) / 2) * pitchX) / scale,
            y: zone.y - ((row - (rows - 1) / 2) * pitchY) / scale,
          }),
        );
      }
    }
    const footprint = pointBounds(
      zone.points.map((p) => worldTargets.get(p.traceId)!),
    );
    const padX = (reading ? full.width : 10) / scale / 2;
    const padY = (reading ? full.height : 10) / scale / 2;
    zones.push({
      zone,
      bounds: {
        minX: footprint.minX - padX,
        maxX: footprint.maxX + padX,
        minY: footprint.minY - padY,
        maxY: footprint.maxY + padY,
      },
    });
  }
  const offsets = separateReadingZones(zones, 64 / scale, anchorZoneId);
  for (const point of model.points) {
    const target = worldTargets.get(point.traceId)!;
    const offset = offsets.get(point.groupId)!;
    worldTargets.set(point.traceId, {
      x: target.x + offset.x,
      y: target.y + offset.y,
    });
  }
  return { bounds: model.bounds, size, worldTargets };
}

export function displayedNodeWorldPoint(
  point: MapPoint,
  zoom: number,
  layout: TopicMapNodeLayout,
): MapPosition {
  const blend = readingLayoutBlend(zoom);
  const target = layout.worldTargets.get(point.traceId);
  if (!blend || !target) return { x: point.x, y: point.y };
  if (blend === 1) return { ...target };
  return {
    x: point.x + (target.x - point.x) * blend,
    y: point.y + (target.y - point.y) * blend,
  };
}

export function prepareMapNodes(
  model: TopicMapModel,
  layout: TopicMapNodeLayout,
  camera: Camera,
  size: Size,
  pointer: MapPosition,
  readingTopic: string | null = null,
  worldPositions?: ReadonlyMap<string, MapPosition>,
): TopicMapNodeFrame {
  const full = readingNodeSize(size);
  const blend = readingLayoutBlend(camera.zoom);
  const cells = new Map<string, number[]>();
  const cellWidth = full.width + 8;
  const cellHeight = full.height + 8;
  const prepared = model.points.map((point, index) => {
    const worldPosition =
      worldPositions?.get(point.traceId) ??
      displayedNodeWorldPoint(point, camera.zoom, layout);
    const projected = screenPoint(worldPosition, camera, model.bounds, size);
    const depth = point.depth * (1 - blend);
    const center = {
      x: projected.x + pointer.x * depth * 6,
      y: projected.y + pointer.y * depth * 6,
    };
    const diameter = (5 + depth) * Math.sqrt(Math.min(camera.zoom, 4));
    const growth = readingTopic && point.groupId !== readingTopic ? 0 : blend;
    const growWidth = (full.width - diameter) * growth;
    const growHeight = (full.height - diameter) * growth;
    const cellX = Math.floor(center.x / cellWidth);
    const cellY = Math.floor(center.y / cellHeight);
    const key = `${cellX},${cellY}`;
    const cell = cells.get(key) ?? [];
    cell.push(index);
    cells.set(key, cell);
    return {
      point,
      worldPosition,
      center,
      diameter,
      growWidth,
      growHeight,
      growth,
      cellX,
      cellY,
    };
  });
  const axisLimit = (distance: number, base: number, growth: number) => {
    if (growth > 0) return (Math.abs(distance) - base - 8) / growth;
    return Math.abs(distance) >= base + 8 ? Infinity : -Infinity;
  };
  const nodeById = new Map<string, TopicMapNode>();
  const nodes: TopicMapNode[] = [];
  for (const item of prepared) {
    let clearance = 1;
    if (item.growth) {
      neighbors: for (let x = item.cellX - 1; x <= item.cellX + 1; x++) {
        for (let y = item.cellY - 1; y <= item.cellY + 1; y++) {
          for (const index of cells.get(`${x},${y}`) ?? []) {
            const other = prepared[index];
            if (other === item) continue;
            const base = (item.diameter + other.diameter) / 2;
            const limit = Math.max(
              0,
              Math.min(
                1,
                Math.max(
                  axisLimit(
                    item.center.x - other.center.x,
                    base,
                    (item.growWidth + other.growWidth) / 2,
                  ),
                  axisLimit(
                    item.center.y - other.center.y,
                    base,
                    (item.growHeight + other.growHeight) / 2,
                  ),
                ),
              ),
            );
            clearance = Math.min(clearance, limit);
            if (!clearance) break neighbors;
          }
        }
      }
    }
    const width = item.diameter + item.growWidth * clearance;
    const height = item.diameter + item.growHeight * clearance;
    const expansion = item.growth * clearance;
    const smaller = Math.min(width, height);
    const node: TopicMapNode = {
      point: item.point,
      center: item.center,
      worldPosition: item.worldPosition,
      rect: {
        x: item.center.x - width / 2,
        y: item.center.y - height / 2,
        width,
        height,
      },
      cornerRadius: Math.min(
        smaller / 2,
        item.diameter / 2 + (8 - item.diameter / 2) * expansion,
      ),
      expansion,
      backgroundOpacity: smoothStep(10, 28, smaller),
      strokeOpacity: smoothStep(10, 24, smaller),
      iconOpacity: smoothStep(20, 36, smaller),
      textOpacity: smoothStep(120, 240, width) * smoothStep(56, 132, height),
      excerpt: item.point.summary,
    };
    nodeById.set(item.point.traceId, node);
    if (
      node.rect.x <= size.width &&
      node.rect.x + width >= 0 &&
      node.rect.y <= size.height &&
      node.rect.y + height >= 0
    )
      nodes.push(node);
  }
  const zones = model.zones.map((zone) => {
    const positions = zone.points.map(
      (p) => nodeById.get(p.traceId)!.worldPosition,
    );
    return {
      ...zone,
      bounds: pointBounds(positions),
      x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length,
      y: positions.reduce((sum, p) => sum + p.y, 0) / positions.length,
    };
  });
  return { model, camera, size, pointer, readingTopic, zones, nodes, nodeById };
}

function roundedDistance(node: TopicMapNode, at: MapPosition) {
  const radius = node.cornerRadius;
  const dx = Math.abs(at.x - node.center.x) - node.rect.width / 2 + radius;
  const dy = Math.abs(at.y - node.center.y) - node.rect.height / 2 + radius;
  return (
    Math.min(Math.max(dx, dy), 0) +
    Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) -
    radius
  );
}

export function hitMapNode(
  frame: TopicMapNodeFrame,
  at: MapPosition,
): MapPoint | null {
  let nearest: TopicMapNode | null = null;
  let distance = Infinity;
  let inside = false;
  for (const node of frame.nodes) {
    const contains = roundedDistance(node, at) <= 0;
    const proximity = Math.hypot(node.center.x - at.x, node.center.y - at.y);
    if (!contains && (inside || proximity > 12)) continue;
    if (
      (contains && !inside) ||
      proximity < distance ||
      (proximity === distance &&
        node.point.traceId < (nearest?.point.traceId ?? ""))
    ) {
      nearest = node;
      distance = proximity;
      inside = contains;
    }
  }
  return nearest?.point ?? null;
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

export function hitZone(frame: TopicMapNodeFrame, at: MapPosition) {
  const { model, camera, size } = frame;
  if (readingLayoutBlend(camera.zoom) >= 1) return null;
  let nearest: TopicMapModel["zones"][number] | null = null;
  let distance = 1;
  for (const zone of frame.zones) {
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

function hoverRectangle(
  anchor: MapRectangle,
  size: Size,
  desired: Size,
): MapRectangle | null {
  if (size.width <= 0 || size.height <= 0) return null;
  const margin = Math.min(12, size.width / 4, size.height / 4);
  const width = Math.min(desired.width, size.width - margin * 2);
  const height = Math.min(desired.height, size.height - margin * 2);
  const center = {
    x: anchor.x + anchor.width / 2,
    y: anchor.y + anchor.height / 2,
  };
  const clampCard = (
    left: number,
    top: number,
    w = width,
    h = height,
  ): MapRectangle => ({
    x: Math.min(Math.max(margin, left), size.width - w - margin),
    y: Math.min(Math.max(margin, top), size.height - h - margin),
    width: w,
    height: h,
  });
  const candidates = [
    [anchor.x + anchor.width + 12, center.y - height / 2],
    [anchor.x - width - 12, center.y - height / 2],
    [center.x - width / 2, anchor.y + anchor.height + 12],
    [center.x - width / 2, anchor.y - height - 12],
  ];
  for (const [x, y] of candidates) {
    const card = clampCard(x, y);
    if (
      card.x >= anchor.x + anchor.width + 4 ||
      card.x + card.width <= anchor.x - 4 ||
      card.y >= anchor.y + anchor.height + 4 ||
      card.y + card.height <= anchor.y - 4
    )
      return card;
  }
  const regions = [
    {
      x: anchor.x + anchor.width + 12,
      y: margin,
      width: size.width - margin - anchor.x - anchor.width - 12,
      height: size.height - margin * 2,
    },
    {
      x: margin,
      y: margin,
      width: anchor.x - margin - 12,
      height: size.height - margin * 2,
    },
    {
      x: margin,
      y: anchor.y + anchor.height + 12,
      width: size.width - margin * 2,
      height: size.height - margin - anchor.y - anchor.height - 12,
    },
    {
      x: margin,
      y: margin,
      width: size.width - margin * 2,
      height: anchor.y - margin - 12,
    },
  ]
    .filter((region) => region.width > 0 && region.height > 0)
    .map((region) => ({
      ...region,
      width: Math.min(width, region.width),
      height: Math.min(height, region.height),
    }))
    .sort((a, b) => b.width * b.height - a.width * a.height);
  const region = regions[0];
  if (region) return clampCard(region.x, region.y, region.width, region.height);
  return clampCard(center.x - width / 2, center.y - height / 2);
}

type TraceHover = {
  point: MapPoint;
  node: TopicMapNode;
  position: MapPosition;
  card: MapRectangle;
  excerpt: string;
  reading: boolean;
};
type ZoneHover = MapZone & {
  position: MapPosition;
  label: MapRectangle;
  detail: string;
};
export function prepareMapHover(
  frame: TopicMapNodeFrame,
  hoveredId: string | null,
  hoveredZoneId: string | null,
): { traces: TraceHover[]; zones: ZoneHover[] } {
  const node = hoveredId ? frame.nodeById.get(hoveredId) : undefined;
  if (node) {
    if (node.textOpacity >= 0.9 || !frame.nodes.includes(node))
      return { traces: [], zones: [] };
    const card = hoverRectangle(node.rect, frame.size, {
      width: 264,
      height: 144,
    });
    return {
      traces: card
        ? [
            {
              point: node.point,
              node,
              position: node.center,
              card,
              excerpt: node.excerpt,
              reading: true,
            },
          ]
        : [],
      zones: [],
    };
  }
  const zone = frame.zones.find((item) => item.id === hoveredZoneId);
  if (!zone) return { traces: [], zones: [] };
  const position = screenPoint(
    zone,
    frame.camera,
    frame.model.bounds,
    frame.size,
  );
  const label = hoverRectangle(
    { ...position, width: 0, height: 0 },
    frame.size,
    { width: 264, height: 108 },
  );
  return {
    traces: [],
    zones: label
      ? [{ ...zone, position, label, detail: zone.description }]
      : [],
  };
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
