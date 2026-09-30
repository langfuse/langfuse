import { type CSSProperties, useEffect, useState } from "react";
import { Layer } from "@/src/components/design-system/Layer/Layer";
import { cn } from "@/src/utils/tailwind";
import styles from "./confetti.module.css";

const PIECE_COUNT = 60;

/**
 * Palette drawn from the chart tokens so the burst stays inside the design
 * system. Skips the tokens that are too dark to read as confetti against the
 * dark theme's near-black background: --chart-3 (grey), --chart-5 and
 * --chart-7 (both under 30% lightness).
 */
const COLOR_TOKENS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-6))",
  "hsl(var(--chart-8))",
];

const MIN_DURATION_MS = 2200;
const MAX_DURATION_MS = 3600;
const MAX_START_DELAY_MS = 900;
/** Time after mount at which every piece has finished and can be unmounted. */
const TEARDOWN_MS = MAX_DURATION_MS + MAX_START_DELAY_MS + 100;

type ConfettiPiece = {
  id: number;
  left: string;
  size: string;
  color: string;
  duration: string;
  delay: string;
  drift: string;
  spin: string;
  round: boolean;
};

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickColor(): string {
  return COLOR_TOKENS[Math.floor(Math.random() * COLOR_TOKENS.length)];
}

function createPieces(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    // Capped below 100 so that pieces near the right edge start on screen
    // rather than already clipped by the overlay's hidden overflow.
    left: `${randomBetween(0, 97).toFixed(2)}vw`,
    size: `${randomBetween(6, 12).toFixed(1)}px`,
    color: pickColor(),
    duration: `${Math.round(randomBetween(MIN_DURATION_MS, MAX_DURATION_MS))}ms`,
    delay: `${Math.round(randomBetween(0, MAX_START_DELAY_MS))}ms`,
    drift: `${randomBetween(-18, 18).toFixed(2)}vw`,
    spin: `${Math.round(randomBetween(360, 1080))}deg`,
    round: Math.random() < 0.35,
  }));
}

/**
 * One-shot decorative confetti burst covering the viewport.
 *
 * Rendered into the lowest overlay layer rather than in place: the app root
 * is `isolation: isolate`, so an in-tree overlay with no z-index paints below
 * the page header, the sidebar and the table's sticky chrome. The layer
 * containers are body-level siblings of the app root and therefore paint
 * above all of it by DOM order, with no z-index of their own. `panel` is the
 * lowest layer, which keeps a decorative effect below modals, popovers and
 * tooltips.
 *
 * Pieces are generated in an effect rather than during render: the values are
 * random, so producing them on the server would not survive hydration. They
 * are dropped again once the animation is over so nothing keeps animating
 * behind the page.
 */
export function Confetti() {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    setPieces(createPieces(PIECE_COUNT));
    const timeout = window.setTimeout(() => setPieces([]), TEARDOWN_MS);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <Layer name="panel">
      <div className={styles.overlay} aria-hidden="true" data-testid="confetti">
        {pieces.map((piece) => (
          <span
            key={piece.id}
            className={cn(styles.piece, piece.round && styles.round)}
            style={
              {
                "--confetti-left": piece.left,
                "--confetti-size": piece.size,
                "--confetti-color": piece.color,
                "--confetti-duration": piece.duration,
                "--confetti-delay": piece.delay,
                "--confetti-drift": piece.drift,
                "--confetti-spin": piece.spin,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </Layer>
  );
}
