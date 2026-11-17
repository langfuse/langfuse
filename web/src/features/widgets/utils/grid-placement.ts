type GridRect = {
  x: number;
  y: number;
  x_size: number;
  y_size: number;
};

function collides(a: GridRect, b: GridRect): boolean {
  return (
    a.x < b.x + b.x_size &&
    b.x < a.x + a.x_size &&
    a.y < b.y + b.y_size &&
    b.y < a.y + a.y_size
  );
}

/** Finds the first free slot in reading order without moving existing tiles. */
export function findFreeGridPosition(
  existing: readonly GridRect[],
  size: Pick<GridRect, "x_size" | "y_size">,
  columns = 12,
): Pick<GridRect, "x" | "y"> {
  const rows = [
    ...new Set([0, ...existing.map((tile) => tile.y + tile.y_size)]),
  ].sort((a, b) => a - b);
  for (const y of rows) {
    for (let x = 0; x + size.x_size <= columns; x++) {
      const candidate = { x, y, x_size: size.x_size, y_size: size.y_size };
      if (existing.every((tile) => !collides(tile, candidate))) return { x, y };
    }
  }
  return { x: 0, y: rows[rows.length - 1] ?? 0 };
}

/**
 * Makes room for a tile inserted at a specific grid position ("paste to the
 * right", duplicate-next-to): every existing tile that overlaps the inserted
 * rect is pushed straight down below it, cascading onto tiles below —
 * the same displacement react-grid-layout performs when a tile is dragged
 * into an occupied slot. Without this, handing the grid an overlapping
 * layout makes it move the NEW tile down instead, so "to the right" only
 * ever worked into empty space.
 *
 * Pure: returns adjusted copies (only `y` changes); tiles that are not in
 * the way keep their position. The grid's vertical compaction then closes
 * any gaps the cascade left.
 */
export function pushDownForInsertion<T extends GridRect>(
  existing: T[],
  inserted: GridRect,
): T[] {
  const result = existing.map((widget) => ({ ...widget }));

  // Settle tiles in reading order so pushes cascade top-down
  // deterministically; each tile is placed below everything already settled
  // that it overlaps (the inserted rect settles first).
  const settled: GridRect[] = [inserted];
  const inReadingOrder = [...result].sort((a, b) => a.y - b.y || a.x - b.x);

  for (const widget of inReadingOrder) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const other of settled) {
        if (collides(widget, other)) {
          widget.y = other.y + other.y_size;
          moved = true;
        }
      }
    }
    settled.push(widget);
  }

  return result;
}
