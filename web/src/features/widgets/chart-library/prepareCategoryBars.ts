import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { seriesColor } from "@/src/features/widgets/chart-library/TimeSeriesLegend";

/**
 * How many bars a colour can still IDENTIFY. The chart palette holds 8 slots and
 * `seriesColor` cycles them, so from the ninth bar on two bars share a colour
 * and a swatch names nothing — a legend built on it would be actively wrong
 * about which bar is which. Past the limit we colour every bar alike and leave
 * identity to the tooltip, rather than shipping a legend that lies.
 * (ARCHITECTURE.md V6: colour is identity, and the palette is bounded.)
 */
export const CATEGORY_COLOR_LIMIT = 8;

type CategoryBarRow = DataPoint & { fill?: string };

export type CategoryBarLegendItem = { category: string; color: string };

export type CategoryBars = {
  /**
   * Rows for recharts, each carrying its own `fill` when colour can identify.
   * A per-row `fill` is the recharts idiom the tooltip already reads back for
   * its swatch (see `getFillColor`), so bar, legend and tooltip cannot diverge.
   */
  rows: CategoryBarRow[];
  /** One entry per bar, in bar order — empty when colour cannot identify. */
  legend: CategoryBarLegendItem[];
  /** Distinct categories, so a caller can say so when there is no legend. */
  total: number;
};

/**
 * Preparer (data -> visualiser seam): decides whether a bar chart's categorical
 * axis can be identified by colour, and if so assigns the colours and the
 * legend that reads them back — one derivation, so swatch and fill are the same
 * value rather than two lookups that agree by luck.
 *
 * Colour is keyed by a category's FIRST appearance, not by row index, so two
 * rows of the same category always share a colour.
 *
 * Pure and side-effect free — see ARCHITECTURE.md.
 */
export function prepareCategoryBars(data: DataPoint[]): CategoryBars {
  const order = new Map<string, number>();
  for (const point of data) {
    const category = point.dimension;
    if (category === undefined || order.has(category)) continue;
    order.set(category, order.size);
  }

  const total = order.size;
  if (total === 0 || total > CATEGORY_COLOR_LIMIT) {
    return { rows: data, legend: [], total };
  }

  return {
    rows: data.map((point) =>
      point.dimension === undefined
        ? point
        : { ...point, fill: seriesColor(order.get(point.dimension) ?? 0) },
    ),
    legend: Array.from(order, ([category, index]) => ({
      category,
      color: seriesColor(index),
    })),
    total,
  };
}
