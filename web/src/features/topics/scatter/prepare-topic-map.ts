import type { RouterOutputs } from "@/src/utils/api";
import { topicColor, UNASSIGNED_SWATCH_COLOR } from "../topic-map-colors";

export type MapData = Pick<
  RouterOutputs["topics"]["map"],
  "points" | "missingSummaryCount" | "unpositionedCount"
>;
export type MapTopic = {
  id: string;
  name: string;
  description?: string;
  /** A CSS color; topics without one take the map's own palette. */
  color?: string;
};
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
type TopicMapNode = {
  point: MapPoint;
  matchesFilters: boolean;
  center: MapPosition;
  worldPosition: MapPosition;
  rect: MapRectangle;
};
export type TopicMapNodeFrame = {
  model: TopicMapModel;
  camera: Camera;
  size: Size;
  pointer: MapPosition;
  readingTopic: string | null;
  matchingTraceIds: ReadonlySet<string> | undefined;
  zones: TopicMapModel["zones"];
  nodes: TopicMapNode[];
  nodeById: ReadonlyMap<string, TopicMapNode>;
};

const emptyBounds = { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5 };
function pointBounds(points: { x: number; y: number }[]): Bounds {
  if (points.length === 0) return emptyBounds;
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
  const zoom = Math.min(128, Math.max(0.4, camera.zoom * 2 ** levels));
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
    topics.map((topic, i) => [
      topic.id,
      { ...topic, color: topic.color ?? topicColor(i) },
    ]),
  );
  const points: MapPoint[] = data.points.map((point) => ({
    ...point,
    groupId:
      point.outcome === "unassigned"
        ? "awaiting_map"
        : (point.topicId ?? "outliers"),
    color:
      (point.topicId ? known.get(point.topicId)?.color : undefined) ??
      UNASSIGNED_SWATCH_COLOR,
    // This is decorative depth, independent of embedding distance or quality.
    depth: visualDepth(point.traceId),
  }));
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
        (id === "awaiting_map" ? "Assignment unavailable" : "Unassigned"),
      description,
      color: topic?.color ?? UNASSIGNED_SWATCH_COLOR,
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

export function prepareMapNodes(
  model: TopicMapModel,
  camera: Camera,
  size: Size,
  pointer: MapPosition,
  readingTopic: string | null = null,
  matchingTraceIds?: ReadonlySet<string>,
): TopicMapNodeFrame {
  // Dots stay dots at any zoom; summaries show in the hover card.
  const nodeById = new Map<string, TopicMapNode>();
  const nodes: TopicMapNode[] = [];
  for (const point of model.points) {
    const worldPosition = { x: point.x, y: point.y };
    const projected = screenPoint(worldPosition, camera, model.bounds, size);
    const center = {
      x: projected.x + pointer.x * point.depth * 6,
      y: projected.y + pointer.y * point.depth * 6,
    };
    const diameter = (5 + point.depth) * Math.sqrt(Math.min(camera.zoom, 4));
    const node: TopicMapNode = {
      point,
      matchesFilters:
        (!readingTopic || point.groupId === readingTopic) &&
        (!matchingTraceIds || matchingTraceIds.has(point.traceId)),
      center,
      worldPosition,
      rect: {
        x: center.x - diameter / 2,
        y: center.y - diameter / 2,
        width: diameter,
        height: diameter,
      },
    };
    nodeById.set(point.traceId, node);
    if (
      node.rect.x <= size.width &&
      node.rect.x + diameter >= 0 &&
      node.rect.y <= size.height &&
      node.rect.y + diameter >= 0
    )
      nodes.push(node);
  }
  return {
    model,
    camera,
    size,
    pointer,
    readingTopic,
    matchingTraceIds,
    zones: model.zones,
    nodes,
    nodeById,
  };
}

type MapTextLabel = {
  id: string;
  kind: "zone";
  title: string;
  color: string;
  description: string;
  rect: MapRectangle;
  fontSize: number;
  opacity: number;
  detailOpacity: number;
};

export function prepareMapTextLabels(frame: TopicMapNodeFrame): MapTextLabel[] {
  const { camera, model, size, readingTopic, matchingTraceIds } = frame;
  const visibility = smoothStep(1.5, 3, camera.zoom);
  if (!visibility) return [];
  const detailOpacity = smoothStep(3.5, 7, camera.zoom);
  const labels: MapTextLabel[] = [];
  const fontSize = 15 + smoothStep(3, 8, camera.zoom) * 3;
  const visible = (rect: MapRectangle) =>
    rect.x + rect.width > 0 &&
    rect.y + rect.height > 0 &&
    rect.x < size.width &&
    rect.y < size.height;
  for (const zone of frame.zones) {
    const width = Math.min(
      Math.max(120, zone.name.length * fontSize * 0.55),
      260,
      Math.max(80, size.width - 32),
    );
    const titleHeight =
      Math.min(2, Math.ceil((zone.name.length * fontSize * 0.55) / width)) *
      fontSize *
      1.2;
    const height = titleHeight + 40 * detailOpacity;
    const topLeft = screenPoint(
      { x: zone.bounds.minX, y: zone.bounds.maxY },
      camera,
      model.bounds,
      size,
    );
    const bottomRight = screenPoint(
      { x: zone.bounds.maxX, y: zone.bounds.minY },
      camera,
      model.bounds,
      size,
    );
    const left = Math.max(0, topLeft.x);
    const right = Math.min(size.width, bottomRight.x);
    const top = Math.max(0, topLeft.y);
    const bottom = Math.min(size.height, bottomRight.y);
    // A zone keeps one geographic label as its center moves beyond the viewport.
    // Clamping to the visible intersection is continuous through pan and zoom.
    if (right < left || bottom < top) continue;
    const center = screenPoint(zone, camera, model.bounds, size);
    const xInset = Math.min(width / 2 + 12, (right - left) / 2);
    const yInset = Math.min(height / 2 + 12, (bottom - top) / 2);
    const x = Math.max(left + xInset, Math.min(right - xInset, center.x));
    const y = Math.max(top + yInset, Math.min(bottom - yInset, center.y));
    const topInset = Math.min(44, size.height / 4);
    const bottomInset = Math.min(28, size.height / 4);
    const rect = {
      x: Math.min(
        Math.max(8, x - width / 2),
        Math.max(8, size.width - width - 8),
      ),
      y: Math.min(
        Math.max(topInset, y - height / 2),
        Math.max(topInset, size.height - height - bottomInset),
      ),
      width,
      height,
    };
    if (!visible(rect)) continue;
    const matchesFilters =
      !matchingTraceIds ||
      zone.points.some((point) => matchingTraceIds.has(point.traceId));
    labels.push({
      id: zone.id,
      kind: "zone",
      title: zone.name,
      color: zone.color,
      description: zone.description,
      rect,
      fontSize,
      opacity:
        visibility *
        (readingTopic && readingTopic !== zone.id ? 0.4 : 1) *
        (matchesFilters ? 1 : 0.15),
      detailOpacity,
    });
  }

  const shown: MapTextLabel[] = [];
  for (const label of labels) {
    let separation = 1;
    for (const other of shown) {
      const x =
        Math.abs(
          label.rect.x +
            label.rect.width / 2 -
            other.rect.x -
            other.rect.width / 2,
        ) /
        ((label.rect.width + other.rect.width) / 2 + 16);
      const y =
        Math.abs(
          label.rect.y +
            label.rect.height / 2 -
            other.rect.y -
            other.rect.height / 2,
        ) /
        ((label.rect.height + other.rect.height) / 2 + 12);
      separation = Math.min(separation, smoothStep(0.8, 1.15, Math.max(x, y)));
    }
    label.opacity *= separation;
    if (label.opacity > 0.01) shown.push(label);
  }
  return labels;
}

export function hitMapNode(
  frame: TopicMapNodeFrame,
  at: MapPosition,
): MapPoint | null {
  let nearest: TopicMapNode | null = null;
  let distance = Infinity;
  let inside = false;
  for (const node of frame.nodes) {
    const proximity = Math.hypot(node.center.x - at.x, node.center.y - at.y);
    const contains = proximity <= node.rect.width / 2;
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

/** Topic halos fade out as you zoom in, so close clusters keep a clean background. */
export function haloVisibility(zoom: number) {
  return 1 - smoothStep(3, 10, zoom);
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

type MapHoverRectangle = MapRectangle & {
  anchorY: number;
  anchorFraction: 0 | 0.5 | 1;
};

function hoverRectangle(
  anchor: MapRectangle,
  size: Size,
  desired: Size,
): MapHoverRectangle | null {
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
  ): MapHoverRectangle => {
    const x = Math.min(Math.max(margin, left), size.width - w - margin);
    const y = Math.min(Math.max(margin, top), size.height - h - margin);
    let anchorY = center.y;
    let anchorFraction: MapHoverRectangle["anchorFraction"] = 0.5;
    if (y + h <= anchor.y - 4) {
      anchorY = y + h;
      anchorFraction = 1;
    } else if (y >= anchor.y + anchor.height + 4) {
      anchorY = y;
      anchorFraction = 0;
    }
    return {
      x,
      y,
      width: w,
      height: h,
      anchorY,
      anchorFraction,
    };
  };
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
      y: center.y - height / 2,
      width: size.width - margin - anchor.x - anchor.width - 12,
      height: size.height - margin * 2,
    },
    {
      x: margin,
      y: center.y - height / 2,
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
      y: anchor.y - height - 12,
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
  topicName: string | undefined;
  node: TopicMapNode;
  position: MapPosition;
  card: MapHoverRectangle;
  excerpt: string;
};
type ZoneHover = MapZone & {
  position: MapPosition;
  label: MapHoverRectangle;
  detail: string;
};
export function prepareMapHover(
  frame: TopicMapNodeFrame,
  hoveredId: string | null,
  hoveredZoneId: string | null,
): { traces: TraceHover[]; zones: ZoneHover[] } {
  const node = hoveredId ? frame.nodeById.get(hoveredId) : undefined;
  if (node) {
    if (!frame.nodes.includes(node)) return { traces: [], zones: [] };
    const card = hoverRectangle(node.rect, frame.size, {
      width: 264,
      height: 184,
    });
    return {
      traces: card
        ? [
            {
              point: node.point,
              topicName: frame.model.zones.find(
                (zone) => zone.id === node.point.groupId,
              )?.name,
              node,
              position: node.center,
              card,
              excerpt: node.point.summary,
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
