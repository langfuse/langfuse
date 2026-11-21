import { memo, useMemo } from "react";

import {
  type PixelMap,
  type PixelPalette,
} from "@/src/features/dashboard/components/HomeFestive/sprites";

type PixelRun = {
  key: string;
  left: number;
  top: number;
  width: number;
  color: string;
};

// Neighbouring pixels of one colour in a row become a single block.
function toRuns(
  map: PixelMap,
  scale: number,
  palette: PixelPalette,
): PixelRun[] {
  const runs: PixelRun[] = [];

  map.forEach((row, rowIndex) => {
    let start = 0;

    while (start < row.length) {
      const character = row.charAt(start);
      let end = start + 1;

      while (end < row.length && row.charAt(end) === character) {
        end += 1;
      }

      const color = palette[character];

      if (color) {
        runs.push({
          key: `${rowIndex}:${start}`,
          left: start * scale,
          top: rowIndex * scale,
          width: (end - start) * scale,
          color,
        });
      }

      start = end;
    }
  });

  return runs;
}

/** Pixel art from a character map: hard-edged blocks, no smoothing. */
export const PixelSprite = memo(function PixelSprite({
  map,
  scale,
  palette,
}: {
  map: PixelMap;
  /** Size of one pixel in CSS px. */
  scale: number;
  palette: PixelPalette;
}) {
  const runs = useMemo(
    () => toRuns(map, scale, palette),
    [map, scale, palette],
  );

  return (
    <span
      aria-hidden
      className="relative block"
      style={{
        width: (map[0]?.length ?? 0) * scale,
        height: map.length * scale,
      }}
    >
      {runs.map((run) => (
        <span
          key={run.key}
          className="absolute"
          style={{
            left: run.left,
            top: run.top,
            width: run.width,
            height: scale,
            background: run.color,
          }}
        />
      ))}
    </span>
  );
});
