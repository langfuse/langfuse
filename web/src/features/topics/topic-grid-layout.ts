export type GridPoint = {
  id: string;
  x: number;
  y: number;
  /** Index into the ordered topic list; negative for outliers. */
  topicIndex: number;
  /** Trace IDs this point stands for when the grid is sampled; first is `id`. */
  memberIds?: string[];
};

export type GridCell = GridPoint & { col: number; row: number };

export type GridLayout = {
  cols: number;
  rows: number;
  cells: GridCell[];
};

/** Most squares drawn; above it each square stands for several traces. */
const MAX_GRID_DOTS = 1000;

/** Bands per axis used to keep each sampled point's members spatially close. */
const SAMPLE_BANDS = 24;

/** One point per run of `perDot` neighbours within a topic, keeping cluster shapes and topic shares. */
export function sampleGridPoints(
  points: GridPoint[],
  maxDots = MAX_GRID_DOTS,
): { points: GridPoint[]; perDot: number } {
  const perDot = Math.max(1, Math.ceil(points.length / maxDots));
  if (perDot === 1) return { points, perDot };
  const byTopic = new Map<number, GridPoint[]>();
  for (const point of points) {
    const list = byTopic.get(point.topicIndex) ?? [];
    list.push(point);
    byTopic.set(point.topicIndex, list);
  }
  const ys = points.map((point) => point.y);
  const minY = Math.min(...ys);
  const spanY = Math.max(...ys) - minY || 1;
  const band = (point: GridPoint) =>
    Math.floor(((point.y - minY) / spanY) * (SAMPLE_BANDS - 1));
  const sampled: GridPoint[] = [];
  for (const list of byTopic.values()) {
    list.sort(
      (a, b) => band(a) - band(b) || a.x - b.x || a.id.localeCompare(b.id),
    );
    for (let index = 0; index < list.length; index += perDot) {
      const members = list.slice(index, index + perDot);
      sampled.push({
        ...members[0],
        memberIds: members.map((member) => member.id),
      });
    }
  }
  return { points: sampled, perDot };
}

/** Cells per point; the slack keeps cluster shapes readable after snapping. */
const CELL_DENSITY = 2.5;

export function layoutTopicGrid(
  points: GridPoint[],
  aspectRatio: number,
): GridLayout {
  if (points.length === 0) return { cols: 0, rows: 0, cells: [] };
  const aspect =
    aspectRatio > 0 && Number.isFinite(aspectRatio) ? aspectRatio : 1;
  const totalCells = Math.ceil(points.length * CELL_DENSITY);
  const cols = Math.max(1, Math.round(Math.sqrt(totalCells * aspect)));
  const rows = Math.max(1, Math.ceil(totalCells / cols));

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const targets = points.map((point) => ({
    point,
    col: ((point.x - minX) / spanX) * (cols - 1),
    row: ((point.y - minY) / spanY) * (rows - 1),
  }));

  const centroids = new Map<number, { col: number; row: number; n: number }>();
  for (const target of targets) {
    const centroid = centroids.get(target.point.topicIndex) ?? {
      col: 0,
      row: 0,
      n: 0,
    };
    centroid.col += target.col;
    centroid.row += target.row;
    centroid.n += 1;
    centroids.set(target.point.topicIndex, centroid);
  }
  const ordered = targets
    .map((target) => {
      const centroid = centroids.get(target.point.topicIndex)!;
      const dc = target.col - centroid.col / centroid.n;
      const dr = target.row - centroid.row / centroid.n;
      return { ...target, distance: Math.hypot(dc, dr) };
    })
    .sort(
      (a, b) =>
        Number(a.point.topicIndex < 0) - Number(b.point.topicIndex < 0) ||
        a.distance - b.distance ||
        compareIds(a.point.id, b.point.id),
    );

  const taken = new Uint8Array(cols * rows);
  const cells: GridCell[] = [];
  for (const target of ordered) {
    const cell = nearestFreeCell(target.col, target.row, cols, rows, taken);
    taken[cell.row * cols + cell.col] = 1;
    cells.push({ ...target.point, col: cell.col, row: cell.row });
  }
  cells.sort((a, b) => compareIds(a.id, b.id));

  return { cols, rows, cells };
}

function nearestFreeCell(
  targetCol: number,
  targetRow: number,
  cols: number,
  rows: number,
  taken: Uint8Array,
) {
  const startCol = clamp(Math.round(targetCol), 0, cols - 1);
  const startRow = clamp(Math.round(targetRow), 0, rows - 1);
  const maxRadius = Math.max(cols, rows);
  for (let radius = 0; radius <= maxRadius; radius++) {
    let best: { col: number; row: number; distance: number } | null = null;
    for (let row = startRow - radius; row <= startRow + radius; row++) {
      if (row < 0 || row >= rows) continue;
      const onEdge = Math.abs(row - startRow) === radius;
      const step = onEdge || radius === 0 ? 1 : radius * 2;
      for (let col = startCol - radius; col <= startCol + radius; col += step) {
        if (col < 0 || col >= cols || taken[row * cols + col]) continue;
        const distance = Math.hypot(col - targetCol, row - targetRow);
        if (!best || distance < best.distance) best = { col, row, distance };
      }
    }
    if (best) return best;
  }
  throw new Error("Grid has fewer cells than points");
}

function compareIds(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
