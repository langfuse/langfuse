export const IDLE_GAP_THRESHOLD_SECONDS = 5 * 60;

export const computeIdleGapSeconds = (
  previous: { timestamp: Date; latencyMs: number | null },
  current: { timestamp: Date },
): number => {
  const previousEnd = previous.timestamp.getTime() + (previous.latencyMs ?? 0);
  return Math.max(0, (current.timestamp.getTime() - previousEnd) / 1000);
};

export const formatIdleGap = (seconds: number): string => {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 3600) return `${Math.round(rounded / 60)} min`;
  const hours = Math.round(rounded / 3600);
  return `${hours} ${hours === 1 ? "hr" : "hrs"}`;
};
