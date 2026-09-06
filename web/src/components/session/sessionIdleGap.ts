export const IDLE_GAP_THRESHOLD_SECONDS = 5 * 60;

export const computeIdleGapSeconds = (
  previous: { timestamp: Date; latencyMs: number | null },
  current: { timestamp: Date },
): number => {
  const previousEnd = previous.timestamp.getTime() + (previous.latencyMs ?? 0);
  return Math.max(0, (current.timestamp.getTime() - previousEnd) / 1000);
};

export const formatIdleGap = (
  seconds: number,
  labels: {
    minutes: (count: number) => string;
    hours: (count: number) => string;
  } = {
    minutes: (count) => `${count} min`,
    hours: (count) => `${count} ${count === 1 ? "hr" : "hrs"}`,
  },
): string => {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 3600) return labels.minutes(Math.round(rounded / 60));
  const hours = Math.round(rounded / 3600);
  return labels.hours(hours);
};
