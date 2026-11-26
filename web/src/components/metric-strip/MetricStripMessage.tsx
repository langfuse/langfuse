/**
 * A band-height message. Thin by construction: a strip's "nothing to show"
 * must never be a box taller than the band, which clips its own text.
 */
export function MetricStripMessage({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
      {message}
    </div>
  );
}
