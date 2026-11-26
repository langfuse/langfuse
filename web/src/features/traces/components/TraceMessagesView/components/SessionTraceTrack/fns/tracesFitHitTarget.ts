const TRACE_HIT_TARGET_PX = 8;

export function tracesFitHitTarget(
  pieceWidths: readonly number[],
  traceWidths: readonly number[],
  trackPx: number,
) {
  const separators = Math.max(0, pieceWidths.length - 1);
  const inner = trackPx - separators * 2;
  if (inner <= 0) return false;
  const total = pieceWidths.reduce((sum, width) => sum + width, 0);
  if (total <= 0) return false;
  return traceWidths.every(
    (width) => (width / total) * inner >= TRACE_HIT_TARGET_PX,
  );
}
