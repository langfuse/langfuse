export type SessionTraceSpan = {
  id: string;
  name?: string | null;
  startMs: number;
  endMs: number;
};

export function sessionContainsTrace(
  spans: readonly SessionTraceSpan[],
  currentId: string,
) {
  return spans.some((span) => span.id === currentId);
}
