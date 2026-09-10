/** Detail-view title (`name: id`, or just the id), shared by the peek + page. */
export function traceDetailTitle(
  trace: { name?: string | null; id: string } | undefined,
  fallback?: string,
): string | undefined {
  if (!trace) return fallback;
  return trace.name ? `${trace.name}: ${trace.id}` : trace.id;
}
