const TRACE_HIT_TARGET_PX = 8;
const TRACK_PADDING_PX = 4;
const PILL_INSET_PX = 2;

export function tracesFitHitTarget(
  pieceWidths: readonly number[],
  traceWidths: readonly number[],
  trackPx: number,
) {
  const inner = trackPx - TRACK_PADDING_PX;
  if (inner <= 0 || pieceWidths.length === 0) return false;
  const total = pieceWidths.reduce((sum, width) => sum + width, 0);
  if (total <= 0) return false;
  return traceWidths.every(
    (width) => (width / total) * inner - PILL_INSET_PX >= TRACE_HIT_TARGET_PX,
  );
}
