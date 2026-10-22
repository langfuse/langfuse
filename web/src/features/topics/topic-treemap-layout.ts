import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";

export type TreemapTile<T> = {
  item: T;
  x: number;
  y: number;
  width: number;
  height: number;
};

type TreemapNode<T> = { item?: T; children?: TreemapNode<T>[] };

export function layoutTreemap<T extends { count: number }>(
  items: T[],
  width: number,
  height: number,
  gap: number,
): TreemapTile<T>[] {
  if (width <= 0 || height <= 0 || items.length === 0) return [];
  const root = hierarchy<TreemapNode<T>>({
    children: items.map((item) => ({ item })),
  }).sum((node) => node.item?.count ?? 0);
  return treemap<TreemapNode<T>>()
    .tile(treemapSquarify)
    .size([width, height])
    .paddingInner(gap)
    .round(true)(root)
    .leaves()
    .flatMap((leaf) =>
      leaf.data.item
        ? [
            {
              item: leaf.data.item,
              x: leaf.x0,
              y: leaf.y0,
              width: leaf.x1 - leaf.x0,
              height: leaf.y1 - leaf.y0,
            },
          ]
        : [],
    );
}
