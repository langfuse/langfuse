import { type CSSProperties, useEffect, useState } from "react";
import { cn } from "@/src/utils/tailwind";
import styles from "./confetti.module.css";

const DEFAULT_PIECE_COUNT = 60;

/**
 * Themed palette tokens. Deliberately excludes --chart-3 (grey) and --chart-5
 * (dark yellow), which read as dirt rather than confetti.
 */
const COLOR_TOKENS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-6))",
  "hsl(var(--chart-7))",
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

function createPieces(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: `${randomBetween(0, 100).toFixed(2)}vw`,
    size: `${randomBetween(6, 12).toFixed(1)}px`,
    color: COLOR_TOKENS[id % COLOR_TOKENS.length],
    duration: `${Math.round(randomBetween(MIN_DURATION_MS, MAX_DURATION_MS))}ms`,
    delay: `${Math.round(randomBetween(0, MAX_START_DELAY_MS))}ms`,
    drift: `${randomBetween(-18, 18).toFixed(2)}vw`,
    spin: `${Math.round(randomBetween(360, 1080))}deg`,
    round: id % 3 === 0,
  }));
}

/**
 * One-shot decorative confetti burst covering the viewport.
 *
 * Pieces are generated in an effect rather than during render: the values are
 * random, so producing them on the server would not survive hydration. They are
 * dropped again once the animation is over so nothing keeps animating behind
 * the page.
 */
export function Confetti({
  pieceCount = DEFAULT_PIECE_COUNT,
}: {
  pieceCount?: number;
}) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    setPieces(createPieces(pieceCount));
    const timeout = window.setTimeout(() => setPieces([]), TEARDOWN_MS);
    return () => window.clearTimeout(timeout);
  }, [pieceCount]);

  return (
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
  );
}
